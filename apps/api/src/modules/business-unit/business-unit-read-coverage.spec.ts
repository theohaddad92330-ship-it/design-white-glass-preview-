import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * GA-336 — LA GARDE DE COUVERTURE : AUCUN CHEMIN DE LECTURE DE COMPTE
 *          N'ÉCHAPPE À LA QUESTION DU PÉRIMÈTRE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE EST LE VRAI LIVRABLE DE LONG TERME
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-333 prouve qu'un appelant du périmètre EXISTE. GA-334 et GA-335 prouvent
 * que la fiche et ses fragments le portent. Aucune des trois ne prouve que
 * **TOUS** les chemins en ont un — et c'est exactement le trou mesuré le
 * 15/09/2026 (R15N-16) : le périmètre était résolu à deux endroits sur une
 * trentaine de routes, et la garde en place était verte.
 *
 * Celle-ci ÉNUMÈRE. Un chemin de lecture de compte a deux issues, et deux
 * seulement : il porte le périmètre, ou il est INSCRIT ici avec une raison
 * ÉCRITE. Une route nouvelle qui ne fait ni l'un ni l'autre fait rougir la CI.
 *
 * ⚠️ « Inscrit ici » n'est pas « réglé ». Les deux registres ci-dessous sont la
 * DETTE de ce chantier, nommée ligne à ligne ; ils ne doivent que rétrécir.
 * Une entrée devient rouge dès qu'elle ne correspond plus à rien — on ne peut
 * donc pas corriger un chemin sans retirer sa ligne, ni en ajouter un sans
 * l'écrire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QUE CETTE GARDE PROUVE D'ELLE-MÊME
 * ─────────────────────────────────────────────────────────────────────────────
 * · **Elle sait dire NON** — le dernier `describe` casse volontairement un
 *   contrôleur SYNTHÉTIQUE et vérifie que l'extracteur le refuse. Pas besoin
 *   d'abîmer le vrai code pour le prouver, et le témoin est rejoué à chaque run.
 * · **Elle LIT quelque chose** — les deux corpus sont comptés, et un corpus
 *   vide est un rouge. Une garde qui ne trouve aucune route dit « tout va
 *   bien » exactement comme une garde qui les a toutes vues.
 * · **Elle n'attrape pas ce qu'elle ne vise pas** — le témoin synthétique
 *   contient AUSSI une route correctement cloisonnée et une route inscrite au
 *   registre : ni l'une ni l'autre ne doit être signalée.
 */

const API_SRC = join(__dirname, '..', '..')
const ACCOUNTS_CONTROLLER = join(API_SRC, 'modules', 'accounts', 'accounts.controller.ts')

/**
 * Les trois façons dont une route peut PORTER le périmètre. Elles ne sont pas
 * interchangeables — voir GA-335 — mais du point de vue de la couverture, elles
 * répondent toutes « oui » à la même question.
 */
const PORTEURS_DE_PERIMETRE = ['resolveBusinessUnitScope', 'assertAccountInScope', 'businessUnitScope'] as const

/**
 * LA DETTE, ROUTE PAR ROUTE — `accounts.controller.ts`.
 *
 * Chaque ligne dit pourquoi cette route ne porte pas encore le périmètre. Une
 * raison vide est un rouge : « on verra plus tard » n'est pas une raison, et
 * c'est précisément ce qui a laissé le trou de R15N-16 ouvert.
 */
const ROUTES_SANS_PERIMETRE: Readonly<Record<string, string>> = {
  // ── Les AGRÉGATS de portefeuille. Gravité la plus faible des trois (ils ne
  //    rendent ni le compte entier, ni un fragment nommé, mais un dénombrement)
  //    et coût le plus élevé : le périmètre doit descendre dans la requête du
  //    service, pas se poser au bord. Nommés au rapport de R15N-16.
  // ⚠️ TROIS FACETTES SONT SORTIES D'ICI (#2084.24, 20/09/2026) : `sectors`,
  //    `tags` et `companies`. Le périmètre est DESCENDU dans la requête, comme
  //    cette dette le demandait — `applyBusinessUnitScope` pour les deux
  //    QueryBuilder, `businessUnitScopeClause` pour le SQL brut des étiquettes.
  //    Leur refus est prouvé par `business-unit-aggregates.spec.ts` (GA-367),
  //    qui vérifie AUSSI que la borne d'espace survit et qu'un périmètre VIDE
  //    ne vaut pas « voit tout ». `companies` était la plus grave : elle
  //    rendait les RAISONS SOCIALES de tout l'espace.
  // ⚠️ TROIS AGRÉGATS DE PLUS SONT SORTIS D'ICI (#2084.24, 20/09/2026) :
  //    `signals`, `needs` et `best-references`. Les trois NOMMAIENT les comptes
  //    ligne à ligne — la Veille avec logo et raison sociale, l'écran Besoins
  //    avec les douleurs citées. Prouvés par GA-367.
  // ⚠️ `GET 'needs/plays'` EST SORTI D'ICI (#2084.24, 20/09/2026) : le plan
  //    NOMME le compte qu'il attaque. `need_plays` ne porte pas la colonne
  //    d'unité, la borne se lit donc sur le COMPTE, par un `EXISTS` corrélé.
  "GET 'portfolio-series'":
    'Agrégat — la photo mensuelle du portefeuille. `seriesFor` lit une table d’instantanés, qui ne PORTE pas la dimension BU : il n’y a pas de clause à ajouter, il y a une colonne à créer. Une contrainte SQL s’élargit AVANT le code qui l’écrit (GA-11/GA-12), donc c’est une migration, pas une correction de requête. Revu le 20/09/2026 (#2084.24) : raison confirmée, pas repoussée.',
  "GET 'to-act/summary'":
    'Agrégat d’EXISTENCE — rend un seul booléen (« au moins un compte attend une action ») pour choisir l’écran d’arrivée après l’onboarding ; aucun compte n’est nommé ni compté. Réutilise `accountsAwaitingAction` (même requête que `accounts/to-act`, GA-26) : borner ce booléen, c’est borner cette requête partagée, pas poser une clause au bord.',
  "GET 'similar-to-explore'":
    'Agrégat — des entreprises à explorer, semées par le portefeuille. Revu le 20/09/2026 (#2084.24) : borner le SEMIS est mécanique (dix comptes, et la réponse NOMME le compte d’amorce — c’est la vraie fuite), mais l’EXCLUSION se lit sur TOUT le portefeuille depuis #1576, et la borner ferait proposer en « découverte » un compte déjà suivi par une autre unité, donc créer un doublon dans le même espace. Or on PROPOSE une fusion de doublons, on ne les fabrique pas. Deux moitiés à trancher séparément : c’est un arbitrage produit, pas une correction de requête, et le faire à moitié sans le dire serait pire.',

  // ── Les CRÉATIONS. Elles n'adressent aucun compte existant : il n'y a rien
  //    à cloisonner à l'entrée. Le compte créé retombe sous le périmètre à la
  //    lecture suivante, `business_unit_id` étant nul à la naissance (et donc
  //    visible de tous les cloisonnés, moitié `includeUnassigned` de la règle).
  "POST ''": 'Création — aucun compte existant n’est adressé, il n’y a pas de périmètre à vérifier.',
  "POST 'portfolio'": 'Création — verse un candidat de Découvrir au portefeuille ; aucun compte existant adressé.',
  "DELETE 'portfolio/:siren'":
    'Retrait d’un candidat de Découvrir, adressé par SIREN et borné par `user_id` — pas une lecture de compte.',
  // ⚠️ `POST 'needs/play'` EST SORTI D'ICI (#2084.24, 20/09/2026). Il était
  //    rangé avec les CRÉATIONS parce que son identifiant de compte vient du
  //    CORPS et non de l'URL — mais il vise bien un compte EXISTANT, et il
  //    DÉBITE un crédit de l'espace. Une écriture payante sur un compte d'une
  //    autre unité agit ET facture : la porte passe avant `generate`.

  // ── ⚠️ LES SIX ÉCRITURES SONT SORTIES D'ICI (#2084.24, 20/09/2026), et c'est
  //    ce registre qui les avait trouvées. `POST :id/absorb`, `:id/detach`,
  //    `:id/archive`, `:id/plan/actions`, `:id/plan/angles` et `DELETE :id`
  //    portent désormais la porte de périmètre ; leur refus est prouvé route
  //    par route dans `business-unit-account-writes.spec.ts` (GA-366), qui
  //    vérifie AUSSI que rien n'a été écrit avant le refus.
  //    Le cliquet joue dans les deux sens : ces six lignes ne pouvaient pas
  //    rester, le test « le registre ne garde aucune ligne morte » les aurait
  //    signalées dès le premier `assertAccountInScope` posé.
}

/**
 * LA DETTE, FICHIER PAR FICHIER — les appelants de `findOneForWorkspace` hors
 * du contrôleur des comptes.
 *
 * `appels` est le NOMBRE d'appels sans périmètre attendus dans ce fichier. Il
 * doit correspondre exactement : un appel de plus est un rouge (la dette
 * grossit sans qu'on l'écrive), un appel de moins aussi (la ligne a survécu à
 * sa raison d'être). C'est ce qui en fait un cliquet et pas une liste morte.
 */
const APPELANTS_SANS_PERIMETRE: Readonly<Record<string, { appels: number; raison: string }>> = {
  // ⚠️ FUSION VAGUE 14 — six lignes de ce registre ont été RETIRÉES ici, pas
  // oubliées : `analysis.controller.ts`, `coverage.controller.ts`,
  // `account-favorites.controller.ts`, `mcp-api.controller.ts`,
  // `documents.service.ts` et `meeting-notes.service.ts` passent désormais le
  // périmètre, corrigés par la revue sécurité du 15/09/2026 qui a atterri en
  // parallèle de ce lot. Ce registre est un CLIQUET dans les deux sens : une
  // ligne qui survit à sa raison d'être est un rouge, exactement comme un appel
  // non déclaré.
  'modules/ia-proxy/ia-proxy.controller.ts': {
    appels: 2,
    raison:
      'Laura relit le NOM du compte d’un contact mis en portée (#1951.1), et — depuis #2434.33 — le nom du compte et de ses contacts pour orienter la transcription vocale sur les noms propres du dossier ouvert (`voiceTranscriptionPrompt`). Ce contrôleur ne résout aucun porteur de périmètre — il n’a ni `BusinessUnitScopeService` ni le contexte d’espace actif sous la main — et les deux lectures sont déjà bornées par `workspaceId`. Lui donner la dimension BU demande de câbler le résolveur sur la surface du copilote entière, pas une ligne : c’est le lot suivant.',
  },
  // ⚠️ `modules/accounts/accounts.service.ts` A ÉTÉ RETIRÉ D'ICI (#4786, arbitrage
  //    Louis du 29/10/2026). Sa ligne disait « EXCEPTION DATÉE (Louis, 28/10/2026) »
  //    — un arbitrage qui n'a jamais eu lieu : l'issue qui le cite est née le 29/10
  //    à 07:06 et la ligne a été écrite à 08:31. Louis a tranché l'inverse : « la
  //    garde avait raison, on retire l'exception et on corrige le code ».
  //    `getAccountLinks` porte désormais le périmètre jusqu'à ses deux lectures ET
  //    à la liste des rattachés, qui NOMME des comptes. Preuve du refus :
  //    `accounts.detach.service.spec.ts` › « getAccountLinks — le périmètre
  //    Business Unit (#4786, GA-336) ».
  //    La leçon vaut plus que la ligne : une raison écrite n'est pas une raison
  //    VRAIE, et une dette qui s'autorise d'un arbitrage inventé est un trou, pas
  //    une dette.
  'modules/public-api/public-api.service.ts': {
    appels: 1,
    raison:
      'API publique v1, authentifiée par CLÉ d’espace : il n’y a pas d’utilisateur porteur de périmètre dans ce contexte. La dimension BU est une règle de MEMBRE ; l’étendre à une clé d’espace est une décision produit, pas une correction.',
  },
}

type Route = { cle: string; corps: string }

/** Les routes d'un contrôleur Nest, chacune avec le corps de son handler. */
function extraireRoutes(source: string): Route[] {
  const lignes = source.split('\n')
  const entetes: { index: number; cle: string }[] = []
  for (const [index, ligne] of lignes.entries()) {
    // ⚠️ Un décorateur écrit DANS UN COMMENTAIRE ne compte pas : le dépôt a
    // déjà payé ce défaut (GA-05 comptait les siens, GA-19 aussi).
    const nu = ligne.trim()
    if (nu.startsWith('*') || nu.startsWith('//')) continue
    const trouve = /^\s*@(Get|Post|Put|Patch|Delete)\((.*)\)\s*$/.exec(ligne)
    if (trouve) entetes.push({ index, cle: `${trouve[1]!.toUpperCase()} ${trouve[2]!.trim() || "''"}` })
  }
  return entetes.map((entete, rang) => ({
    cle: entete.cle,
    corps: lignes.slice(entete.index, entetes[rang + 1]?.index ?? lignes.length).join('\n'),
  }))
}

const porteLePerimetre = (corps: string) => PORTEURS_DE_PERIMETRE.some(porteur => corps.includes(porteur))

/** Les appels `findOneForWorkspace(…)` à DEUX arguments — ceux sans périmètre. */
function appelsSansPerimetre(source: string): number {
  let compte = 0
  for (const ligne of source.split('\n')) {
    const nu = ligne.trim()
    if (nu.startsWith('*') || nu.startsWith('//')) continue
    const trouve = /findOneForWorkspace\(([^)]*)\)/.exec(ligne)
    if (!trouve) continue
    // La DÉFINITION de la méthode n'est pas un appel.
    if (/async findOneForWorkspace/.test(ligne)) continue
    const args = trouve[1]!.split(',').filter(part => part.trim().length > 0)
    if (args.length < 3) compte += 1
  }
  return compte
}

function fichiersSources(racine: string): string[] {
  const trouves: string[] = []
  for (const entree of readdirSync(racine)) {
    if (entree === 'node_modules' || entree === 'dist') continue
    const chemin = join(racine, entree)
    if (statSync(chemin).isDirectory()) {
      trouves.push(...fichiersSources(chemin))
      continue
    }
    if (entree.endsWith('.ts') && !entree.endsWith('.spec.ts')) trouves.push(chemin)
  }
  return trouves
}

describe('GA-336 — chaque route du contrôleur des comptes répond à la question du périmètre', () => {
  const routes = extraireRoutes(readFileSync(ACCOUNTS_CONTROLLER, 'utf8'))

  it('le corpus n’est pas vide : les routes sont réellement lues', () => {
    // Une garde qui ne trouve aucune route est verte pour la pire des raisons.
    expect(routes.length).toBeGreaterThanOrEqual(40)
    expect(routes.filter(route => porteLePerimetre(route.corps)).length).toBeGreaterThanOrEqual(20)
  })

  it('aucune route ne se tait : elle porte le périmètre, ou elle est INSCRITE avec sa raison', () => {
    const muettes = routes
      .filter(route => !porteLePerimetre(route.corps))
      .map(route => route.cle)
      .filter(cle => !(cle in ROUTES_SANS_PERIMETRE))

    expect(muettes).toEqual([])
  })

  it('chaque raison inscrite est ÉCRITE — « on verra » n’est pas une raison', () => {
    const trop_courtes = Object.entries(ROUTES_SANS_PERIMETRE)
      .filter(([, raison]) => raison.trim().length <= 40)
      .map(([cle]) => cle)

    expect(trop_courtes).toEqual([])
  })

  it('le registre ne garde aucune ligne morte : une route corrigée en SORT', () => {
    // Sans ce test, le registre deviendrait une liste de vœux : on corrigerait
    // une route sans retirer sa dispense, et la dispense couvrirait la suivante
    // qui prendrait le même nom.
    const parCle = new Map(routes.map(route => [route.cle, route]))
    const mortes = Object.keys(ROUTES_SANS_PERIMETRE).filter(cle => {
      const route = parCle.get(cle)
      // Soit la route a disparu, soit elle porte désormais le périmètre : dans
      // les deux cas, sa ligne au registre a survécu à sa raison d'être.
      return route === undefined || porteLePerimetre(route.corps)
    })

    expect(mortes).toEqual([])
  })
})

describe('GA-336 — chaque appelant de la lecture de fiche passe le périmètre, ou il est INSCRIT', () => {
  const fichiers = fichiersSources(API_SRC)
    .map(chemin => ({ chemin: relative(API_SRC, chemin), source: readFileSync(chemin, 'utf8') }))
    .filter(fichier => fichier.source.includes('findOneForWorkspace('))

  it('le corpus n’est pas vide : les appelants sont réellement lus', () => {
    expect(fichiers.length).toBeGreaterThanOrEqual(5)
  })

  it('aucun appelant ne lit une fiche sans périmètre hors du registre', () => {
    const fautifs = fichiers
      .map(fichier => ({ chemin: fichier.chemin, sans: appelsSansPerimetre(fichier.source) }))
      .filter(fichier => fichier.sans > (APPELANTS_SANS_PERIMETRE[fichier.chemin]?.appels ?? 0))
      .map(fichier => `${fichier.chemin} (${fichier.sans} appel(s) sans périmètre)`)

    expect(fautifs).toEqual([])
  })

  it('le registre des appelants ne garde aucune ligne morte', () => {
    const perimes = Object.entries(APPELANTS_SANS_PERIMETRE).flatMap(([chemin, entree]) => {
      const fichier = fichiers.find(candidat => candidat.chemin === chemin)
      if (!fichier) return [`${chemin} : n’appelle plus la lecture de fiche — retirer la ligne`]
      const sans = appelsSansPerimetre(fichier.source)
      if (sans !== entree.appels)
        return [`${chemin} : ${sans} appel(s) sans périmètre, le registre en déclare ${entree.appels}`]
      if (entree.raison.trim().length <= 40) return [`${chemin} : la raison est trop courte pour en être une`]
      return []
    })

    expect(perimes).toEqual([])
  })
})

describe('GA-336 — TÉMOIN : la garde sait dire NON, et seulement à ce qu’elle vise', () => {
  // Un contrôleur SYNTHÉTIQUE : on casse celui-ci, jamais le vrai code, et la
  // preuve est rejouée à chaque exécution au lieu d'être une note dans un
  // commentaire que plus personne ne mesure.
  const CONTROLEUR_TEMOIN = [
    "  // @Get('commentaire')  ← un décorateur DANS un commentaire ne compte pas",
    "  @Get(':id/avec-porte')",
    '  async avecPorte() {',
    '    await this.assertAccountInScope(id, workspaceId, user.userId)',
    '  }',
    '',
    "  @Get(':id/avec-clause')",
    '  async avecClause() {',
    '    const businessUnitScope = await this.resolveBusinessUnitScope(workspaceId, user.userId)',
    '    return this.accountsService.findOneForWorkspace(id, workspaceId, businessUnitScope)',
    '  }',
    '',
    "  @Get(':id/oublie')",
    '  async oublie() {',
    '    return this.accountsService.findOneForWorkspace(id, workspaceId)',
    '  }',
  ].join('\n')

  const routes = extraireRoutes(CONTROLEUR_TEMOIN)

  it('elle ne compte PAS un décorateur écrit dans un commentaire', () => {
    expect(routes.map(route => route.cle)).toEqual([
      "GET ':id/avec-porte'",
      "GET ':id/avec-clause'",
      "GET ':id/oublie'",
    ])
  })

  it('elle DÉSIGNE la route qui a oublié le périmètre', () => {
    const muettes = routes.filter(route => !porteLePerimetre(route.corps)).map(route => route.cle)

    expect(muettes).toEqual(["GET ':id/oublie'"])
  })

  it('elle laisse tranquilles les deux formes LÉGITIMES de cloisonnement', () => {
    // Le débordement qu'on redoute : une garde qui exigerait UNE seule forme et
    // ferait rougir l'autre, qui est pourtant juste.
    expect(porteLePerimetre(routes[0]!.corps)).toBe(true)
    expect(porteLePerimetre(routes[1]!.corps)).toBe(true)
  })

  it('elle compte les appels à DEUX arguments, et seulement eux', () => {
    expect(appelsSansPerimetre(CONTROLEUR_TEMOIN)).toBe(1)
    expect(appelsSansPerimetre('findOneForWorkspace(id, workspaceId, businessUnitScope)')).toBe(0)
    expect(appelsSansPerimetre('// findOneForWorkspace(id, workspaceId) dans un commentaire')).toBe(0)
    expect(appelsSansPerimetre('  async findOneForWorkspace(id: string, workspaceId: string) {')).toBe(0)
  })
})
