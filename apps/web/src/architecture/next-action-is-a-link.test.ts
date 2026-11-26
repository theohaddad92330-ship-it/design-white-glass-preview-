import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  ACTIVE_MISSION_NEXT_ACTIONS,
  INVOICE_BLOCKERS,
  NEED_NEXT_ACTIONS,
  nextActionLink,
  nextActionRoutes,
} from '@bellum/contracts'
import { describe, expect, it } from 'vitest'

/**
 * UNE PROCHAINE ACTION EST UN LIEN — ET SA DESTINATION EXISTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, MOT POUR MOT (fiche de lecture des 17 écrans cibles, 26/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 *     « À garder — la colonne "prochaine action" sous forme de LIEN. C'est le
 *      meilleur élément de toutes les images, et ça doit devenir une règle du
 *      produit. »
 *
 * Une règle de produit qui n'est pas gardée redevient une opinion en trois
 * semaines. Celle-ci l'était déjà à moitié : sur les écrans qui portent la
 * colonne, un seul la rendait en lien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, ET COMMENT
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **Toute action a une réponse.** Les ENSEMBLES d'identifiants — pas des
 *     chaînes libres — sont confrontés : le vocabulaire déclaré par les
 *     contrats, et celui auquel la dérivation sait répondre. Une septième
 *     action ajoutée au besoin fait rougir la CI tant qu'elle n'a pas de
 *     destination.
 *  2. **Toute destination existe.** Confrontée à l'ARBRE DE ROUTES RÉEL
 *     (`routeTree.gen.ts`), jamais à une liste écrite à la main : une liste
 *     recopiée ne voit jamais ce qui n'y est pas. C'est le motif de
 *     `adv-blockers-lead-somewhere.test.ts`, et il est repris tel quel.
 *  3. **Aucun écran ne rend une prochaine action en TEXTE NU.** La clé i18n
 *     d'une action se construit dans la dérivation et se résout dans
 *     `NextAction` — nulle part ailleurs. Un écran qui écrit
 *     `` <Text>{t(`openNeeds.nextAction.${a}`)}</Text> `` reconstruit la clé à
 *     la main : c'est exactement le geste qui rendait la colonne muette sur six
 *     écrans, et c'est celui-là qu'on interdit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE PRÉTEND PAS SAVOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne dit pas si l'écran de destination RÉPARE effectivement l'action — ça
 * demanderait de reconnaître un geste métier dans du JSX. Elle ne voit pas non
 * plus une clé assemblée par morceaux (`` t(`openNeeds.${famille}.${a}`) ``).
 * Ce qu'elle sait dire est exact : la porte existe, ou elle n'existe pas ; la
 * clé est reconstruite à la main, ou elle ne l'est pas.
 *
 * ⚠️ Elle RETIRE les commentaires avant de chercher. Ce fichier CITE les formes
 * fautives pour expliquer la règle : les compter ferait tomber la garde sur sa
 * propre documentation, et la seule façon de documenter deviendrait de ne pas
 * documenter. Défaut déjà payé sur GA-08, GA-19 et GA-25.
 */

const WEB_SRC = join(__dirname, '..')
const ROUTE_TREE_FILE = join(WEB_SRC, 'routeTree.gen.ts')
const COMPONENT_FILE = join(WEB_SRC, 'components', 'primitives', 'NextAction.tsx')

/* ────────────────────────────────────────────────────────────────────────── */
/*  Les outils — chacun testé plus bas sur des formes fautives ET légitimes   */
/* ────────────────────────────────────────────────────────────────────────── */

/** Sans ça, la garde se déclencherait sur les exemples cités en commentaire. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Les chemins DÉCLARÉS par l'arbre de routes, extraits des lignes `path: '/…'`
 * qu'il génère. Jamais d'une liste tenue à la main : une liste recopiée diverge,
 * et une garde qui compare deux copies de la même erreur reste verte.
 */
function declaredRoutes(): Set<string> {
  const tree = readFileSync(ROUTE_TREE_FILE, 'utf8')
  return new Set([...tree.matchAll(/^\s*path: '([^']+)'/gm)].map(match => match[1] as string))
}

/**
 * Une clé de libellé de prochaine action RECONSTRUITE À LA MAIN dans un écran.
 *
 * ⚠️ Sans le drapeau `g` : une expression à drapeau `g` est À ÉTAT et rend
 * `false` un appel sur deux (défaut déjà payé sur GA-29).
 */
function rebuildsALabelKey(source: string): boolean {
  return /nextAction\.\$\{/.test(stripComments(source))
}

function tsxFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return tsxFiles(full)
    return entry.endsWith('.tsx') && !entry.includes('.test.') ? [full] : []
  })
}

/** Tous les écrans du produit. Le corpus, et il ne se réduit à aucune liste. */
function screens(): { path: string; source: string }[] {
  return tsxFiles(join(WEB_SRC, 'features')).map(path => ({ path, source: readFileSync(path, 'utf8') }))
}

function short(path: string): string {
  return path.slice(path.indexOf('/src/'))
}

/**
 * LES ÉCRANS QUI RENDENT UNE PROCHAINE ACTION DÉRIVÉE, nommés un par un.
 *
 * Nommés, et c'est délibéré : compter « au moins trois liens quelque part »
 * resterait vert le jour où l'un des trois perd le sien et qu'un quatrième
 * naît ailleurs (leçon de GA-59).
 *
 * ⚠️ La fiche d'un besoin est dedans alors qu'elle rend du TEXTE : elle passe
 * par le MÊME composant, qui refuse de fabriquer un lien vers l'écran où l'on
 * est déjà. C'est le composant qui tranche, pas l'écran — sinon la règle vaut
 * ce que vaut la mémoire de celui qui écrit le prochain écran.
 */
const RENDERING_SCREENS: { screen: string; file: string }[] = [
  {
    screen: 'liste des besoins ouverts — colonne « Prochaine action »',
    file: 'features/projects/open-needs/view/OpenNeedsTable.tsx',
  },
  {
    screen: 'fiche d’un besoin — champ « Prochaine action » (destination = cet écran)',
    file: 'features/projects/open-needs/view/NeedDetailPage.tsx',
  },
  {
    screen: 'dossier de compte, onglet Missions — colonne « Prochaine action »',
    file: 'features/accounts/view/account-detail/tabs/TabMissions.tsx',
  },
  /**
   * Les deux ajoutés le 04/09/2026 (#1354, #1355, #1357, #1366, #1383).
   *
   * ⚠️ `/missions` a compté pour DEUX entrées pendant une journée, et n'en
   * compte plus qu'UNE — la raison de la fusion est plus intéressante que la
   * fusion.
   *
   * La lentille « En cours » rendait un TABLEAU, la lentille
   * « Renouvellements » des CARTES : deux rendus, donc deux entrées, parce
   * qu'un correctif appliqué au premier ne touchait pas le second. C'est
   * exactement ce que la recette live du 03/09 avait trouvé sur #1353, trois
   * minutes après le déploiement.
   *
   * #1362 a supprimé la cause plutôt que de la surveiller : les
   * renouvellements rendent désormais le MÊME tableau. Il n'y a plus qu'un
   * rendu, donc plus qu'un endroit à garder — et surtout plus de second rendu
   * qui puisse diverger. Une garde qui continuerait de nommer
   * `MissionsPage.tsx` exigerait un `NextAction` dans un fichier qui n'en rend
   * plus : elle rougirait sur un code JUSTE, ce qui est la façon la plus sûre
   * de se faire désactiver.
   */
  {
    screen: 'liste des missions, « En cours » ET « Renouvellements » — colonne « Prochaine action »',
    file: 'features/missions/view/MissionsTable.tsx',
  },
  {
    screen: 'suivi des missions — colonne « Prochaine action » (bloqueurs de facturation)',
    file: 'features/mission-tracking/view/MissionTrackingTable.tsx',
  },
]

/* ────────────────────────────────────────────────────────────────────────── */
/*  La garde LIT quelque chose                                               */
/* ────────────────────────────────────────────────────────────────────────── */

describe('la garde a un corpus, et il n’est pas vide', () => {
  it('lit l’arbre de routes, et il en contient', () => {
    // Un `routeTree.gen.ts` tronqué ou un motif d'extraction cassé rendrait
    // tous les tests de destination verts en ne vérifiant plus rien.
    const routes = declaredRoutes()
    expect(routes.size).toBeGreaterThan(20)
    expect(routes.has('/projects/needs/$needId')).toBe(true)
    expect(routes.has('/missions/$id')).toBe(true)
  })

  it('lit les vocabulaires à leur source, et ils ne sont pas vides', () => {
    expect(NEED_NEXT_ACTIONS.length).toBeGreaterThanOrEqual(6)
    expect(ACTIVE_MISSION_NEXT_ACTIONS.length).toBeGreaterThanOrEqual(5)
    expect(INVOICE_BLOCKERS.length).toBeGreaterThanOrEqual(10)
    expect(nextActionRoutes().length).toBeGreaterThan(0)
  })

  it('lit les écrans du produit, et il y en a beaucoup', () => {
    // Un chemin faux (`features` renommé) rendrait le balayage muet : zéro
    // fichier, zéro faute, vert pour toujours. C'est le faux zéro silencieux.
    const corpus = screens()
    expect(corpus.length).toBeGreaterThan(200)
    for (const { screen, file } of RENDERING_SCREENS) {
      expect(
        corpus.some(entry => entry.path.endsWith(file)),
        `écran introuvable dans le corpus : ${screen} (${file})`,
      ).toBe(true)
    }
  })

  it('le composant de rendu existe, et il rend un vrai lien', () => {
    expect(existsSync(COMPONENT_FILE)).toBe(true)
    const source = stripComments(readFileSync(COMPONENT_FILE, 'utf8'))
    // Ce qui se clique se tabule (GA-35) : un `<Link>` rend un `<a>`, avec sa
    // touche Entrée et son nom accessible, sans qu'on ait rien à ajouter.
    expect(/<Link\b/.test(source)).toBe(true)
    // Et il ne décide RIEN : la correspondance vit dans la dérivation (GA-26).
    expect(/nextActionLink\(/.test(source)).toBe(true)
  })
})

/* ────────────────────────────────────────────────────────────────────────── */
/*  1 — toute action a une réponse (ensembles d'IDENTIFIANTS)                */
/* ────────────────────────────────────────────────────────────────────────── */

describe('toute action du vocabulaire a un libellé et une réponse', () => {
  it('les six actions d’un besoin sont toutes couvertes', () => {
    const answered = NEED_NEXT_ACTIONS.filter(
      action => nextActionLink({ domain: 'need', action, needId: 'x' }).labelKey.length > 0,
    )
    // Comparaison d'ENSEMBLES, pas de chaînes libres : une action ajoutée au
    // contrat et oubliée dans la table de destinations sort d'ici.
    expect(new Set(answered)).toEqual(new Set(NEED_NEXT_ACTIONS))
  })

  it('toutes les actions d’une mission active sont couvertes', () => {
    const answered = ACTIVE_MISSION_NEXT_ACTIONS.filter(
      action => nextActionLink({ domain: 'active_mission', action, missionId: 'x' }).labelKey.length > 0,
    )
    expect(new Set(answered)).toEqual(new Set(ACTIVE_MISSION_NEXT_ACTIONS))
  })

  it('tous les bloqueurs de facturation sont couverts', () => {
    const answered = INVOICE_BLOCKERS.filter(action => nextActionLink({ domain: 'invoice_blocker', action }).route)
    expect(new Set(answered)).toEqual(new Set(INVOICE_BLOCKERS))
  })
})

/* ────────────────────────────────────────────────────────────────────────── */
/*  2 — toute destination existe dans l'arbre de routes RÉEL                 */
/* ────────────────────────────────────────────────────────────────────────── */

describe('une prochaine action mène à un écran qui existe', () => {
  it('chaque destination est une route DÉCLARÉE par l’arbre', () => {
    const routes = declaredRoutes()
    const dangling = nextActionRoutes().filter(route => !routes.has(route))
    // Si ce test tombe : la route a été renommée, ou n'a jamais existé. Un lien
    // qui envoie sur « Page introuvable » est PIRE qu'un texte — le texte ne
    // promet rien, le lien promet un geste qui n'aboutit pas.
    expect(dangling, `destinations absentes de l’arbre de routes :\n${dangling.join('\n')}`).toEqual([])
  })

  it('elle sait dire NON — une destination inventée est refusée', () => {
    // La preuve qu'elle mord. Sans elle, on ne saurait pas distinguer « toutes
    // les routes sont bonnes » de « l'ensemble consulté est vide ».
    const routes = declaredRoutes()
    expect(routes.has('/projects/besoins/$needId')).toBe(false)
    expect(routes.has('/missions/$missionId')).toBe(false)
  })

  it('une action paramétrée porte SON paramètre, jamais un `$…` littéral', () => {
    // Un lien vers « /missions/$id » tel quel mène à une page introuvable dont
    // l'URL contient un dollar : c'est un lien mort qui a l'air d'un lien.
    const link = nextActionLink({ domain: 'active_mission', action: 'renew_now', missionId: 'm-9' })
    expect(link.route).toBe('/missions/$id')
    expect(link.params).toEqual({ id: 'm-9' })
  })
})

/* ────────────────────────────────────────────────────────────────────────── */
/*  3 — les libellés existent dans les DEUX langues                          */
/* ────────────────────────────────────────────────────────────────────────── */

describe('le libellé d’une action existe en français ET en anglais', () => {
  function lookup(locale: 'fr' | 'en', labelKey: string): unknown {
    const [namespace, path] = labelKey.split(':')
    const file = join(WEB_SRC, 'i18n', 'locales', locale, `${namespace as string}.json`)
    const bundle: unknown = JSON.parse(readFileSync(file, 'utf8'))
    return (path as string)
      .split('.')
      .reduce<unknown>(
        (node, segment) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[segment] : undefined),
        bundle,
      )
  }

  const allKeys = [
    ...NEED_NEXT_ACTIONS.map(action => nextActionLink({ domain: 'need', action, needId: 'x' }).labelKey),
    ...ACTIVE_MISSION_NEXT_ACTIONS.map(
      action => nextActionLink({ domain: 'active_mission', action, missionId: 'x' }).labelKey,
    ),
    ...INVOICE_BLOCKERS.map(action => nextActionLink({ domain: 'invoice_blocker', action }).labelKey),
  ]

  it('la garde a bien des clés à vérifier', () => {
    expect(allKeys.length).toBeGreaterThanOrEqual(20)
  })

  it.each(['fr', 'en'] as const)('%s — aucune clé de libellé ne manque', locale => {
    const missing = allKeys.filter(key => typeof lookup(locale, key) !== 'string')
    // Une clé absente s'affiche BRUTE à l'écran (« openNeeds.nextAction.… »).
    // La dérivation ne réinvente pas de libellés : elle réutilise ceux qui sont
    // déjà livrés, et ce test prouve qu'ils sont bien là.
    expect(missing, `libellés manquants en ${locale} :\n${missing.join('\n')}`).toEqual([])
  })

  it('elle sait dire NON — une clé inventée est introuvable', () => {
    expect(lookup('fr', 'projects:openNeeds.nextAction.inventee')).toBeUndefined()
  })
})

/* ────────────────────────────────────────────────────────────────────────── */
/*  4 — aucun écran ne rend une prochaine action en TEXTE NU                 */
/* ────────────────────────────────────────────────────────────────────────── */

describe('la clé d’une prochaine action ne se reconstruit nulle part ailleurs', () => {
  it('aucun écran ne réassemble `…nextAction.${…}` à la main', () => {
    const offenders = screens()
      .filter(file => rebuildsALabelKey(file.source))
      .map(file => short(file.path))
      .sort()
    // Si ce test tombe : un écran rend une prochaine action sans passer par
    // `NextAction`, donc sans lien, donc en texte mort. C'est l'état d'avant —
    // six écrans nommaient le geste et cachaient l'endroit.
    expect(offenders, `prochaines actions rendues en texte nu :\n${offenders.join('\n')}`).toEqual([])
  })

  it('les écrans qui rendent une prochaine action passent tous par le composant', () => {
    const mute = RENDERING_SCREENS.filter(({ file }) => {
      const source = stripComments(readFileSync(join(WEB_SRC, file), 'utf8'))
      // ⚠️ L'ALIAS compte. `MissionTrackingTable` importe le composant sous
      // `NextAction as NextActionLink`, parce qu'un type LOCAL du même nom
      // existe déjà dans son module. Ne chercher que `<NextAction` déclarerait
      // cet écran muet alors qu'il rend le bon composant — et l'« erreur »
      // se réparerait en renommant le type, pas en corrigeant un défaut.
      return !/<NextAction(Link)?\b/.test(source)
    }).map(({ screen, file }) => `${screen} → ${file}`)
    expect(mute, `écrans qui ne rendent plus la prochaine action :\n${mute.join('\n')}`).toEqual([])
  })
})

/* ────────────────────────────────────────────────────────────────────────── */
/*  La garde sait dire NON — sur ses propres outils                          */
/* ────────────────────────────────────────────────────────────────────────── */

describe('la garde sait dire NON', () => {
  it('reconnaît les formes exactes qu’on écrirait en rendant une action en texte', () => {
    // Écrites contre ce que ce dépôt employait RÉELLEMENT avant ce lot — pas
    // contre une syntaxe imaginée. Une garde qui surveille une forme que
    // personne n'écrit est borgne par construction.
    const fautifs = [
      '<Text size="xs">{t(`openNeeds.nextAction.${action}`)}</Text>',
      '<Text element="span" size="sm">{t(`active.nextAction.${row.nextAction}`)}</Text>',
      '<Field label={t("columns.nextAction")}>{t(`openNeeds.nextAction.${nextAction}`)}</Field>',
      '<Badge>{t(`accountMissions:active.nextAction.${a}`)}</Badge>',
    ]
    const manqués = fautifs.filter(line => !rebuildsALabelKey(line))
    expect(manqués, `formes fautives non détectées :\n${manqués.join('\n')}`).toEqual([])
  })

  it('ne mord PAS sur les formes légitimes — une garde qui refuse tout ne protège rien', () => {
    const légitimes = [
      '<NextAction action={{ domain: "need", action, needId: row.id }} size="xs" />',
      "<TableHead>{t('openNeeds.columns.nextAction')}</TableHead>",
      "t('activity.missions.nextAction', { title: row.nextAction.title })",
      'const action = needNextAction(row, now)',
      // Une AUTRE famille de clés interpolée : ce n'est pas le sujet de la règle.
      't(`needSheet.provenanceValue.${need.provenance}`)',
    ]
    const fauxPositifs = légitimes.filter(line => rebuildsALabelKey(line))
    expect(fauxPositifs, `formes légitimes prises pour des fautes :\n${fauxPositifs.join('\n')}`).toEqual([])
  })

  it('ne se laisse pas tromper par un exemple cité dans un commentaire', () => {
    // Une garde écrite le 31/08 est passée au vert sur du code sabordé parce
    // qu'elle trouvait le mot qu'elle cherchait dans son propre docblock.
    expect(rebuildsALabelKey('/* avant : <Text>{t(`openNeeds.nextAction.${a}`)}</Text> */')).toBe(false)
    expect(rebuildsALabelKey('// fautif : t(`active.nextAction.${row.nextAction}`)')).toBe(false)
    expect(rebuildsALabelKey('/**\n * On ne rend jamais t(`openNeeds.nextAction.${a}`) à la main.\n */')).toBe(false)
    // …et elle voit toujours la vraie faute posée juste après le commentaire.
    expect(rebuildsALabelKey('// fautif :\n<Text>{t(`openNeeds.nextAction.${action}`)}</Text>')).toBe(true)
  })

  it('le retrait des commentaires ne mange pas le code — `//` d’une URL survit', () => {
    // `https://…` porte deux barres obliques : un retrait naïf couperait la
    // ligne entière et rendrait la garde aveugle sur tout ce qui suit.
    expect(stripComments("const doc = 'https://exemple.test/a'\nt(`openNeeds.nextAction.${a}`)")).toContain(
      'nextAction.${a}',
    )
  })
})

/* ────────────────────────────────────────────────────────────────────────── */
/*  5 — UNE LIGNE DE TABLEAU QUI MÈNE À UNE FICHE EST UN VRAI LIEN (#2719)    */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * ÉTENDUE ici plutôt qu'une garde neuve écrite à côté (#2719, critère
 * d'acceptation explicite — GA-26, un réglage vit à un seul endroit) : même
 * famille de règle que « la prochaine action est un lien », un cran plus haut
 * — c'est la LIGNE ENTIÈRE qui mène quelque part, pas une seule cellule.
 *
 * Retour bêta (SKAIZen, 22/09/2026) : clic droit sur une ligne du tableau des
 * contacts ne proposait rien, et le ctrl/cmd-clic était activement ANNULÉ
 * (`event.preventDefault()` dans `ContactContent.tsx`) — le geste n'était pas
 * seulement absent, il était empêché. Le tableau des contacts est le premier
 * écran nommé par le client ; il est recettable seul (issue #2719). Les
 * autres tableaux qui mènent à une page restent à étendre au fur et à mesure
 * — cette liste grandit, elle ne se réécrit pas.
 */
describe('une ligne de tableau qui mène à une fiche est un vrai <a href>', () => {
  const ROW_NAVIGATES_TO_A_PAGE: { screen: string; file: string; hrefPattern: RegExp }[] = [
    {
      screen: 'tableau des contacts — la ligne mène à la fiche contact',
      file: 'features/contacts/view/contacts-list/ContactTableRow.tsx',
      hrefPattern: /<Link\s+to=["']\/contacts\/\$id["']/,
    },
    // #2719.2 — LA LISTE S'ÉTEND, AUX AUTRES TABLEAUX DONT UNE LIGNE MÈNE À
    // UNE PAGE (pas un tiroir ni une fiche latérale — `MissionsTable.tsx` et
    // `ProjectsTable.tsx` ouvrent un `Sheet` sur `onClick`, ce n'est pas la
    // même famille de règle et ils restent hors de cette liste).
    {
      screen: 'liste des besoins ouverts — la ligne mène à la fiche du besoin',
      file: 'features/projects/open-needs/view/OpenNeedsTable.tsx',
      hrefPattern: /<Link\s+to=["']\/projects\/needs\/\$needId["']/,
    },
    {
      screen: 'tableau des comptes — la ligne mène à la fiche compte',
      file: 'features/accounts/view/accounts-list/AccountTableRow.tsx',
      hrefPattern: /<Link\s+to=["']\/accounts\/\$id["']/,
    },
    {
      screen: 'historique des actions — la ligne mène au détail de l’action',
      file: 'features/action-history/view/ActionHistoryRow.tsx',
      hrefPattern: /<Link\s+to=["']\/actions\/\$id["']/,
    },
    {
      screen: 'vivier de consultants — la ligne mène à la fiche du consultant',
      file: 'features/consultants/view/VivierTableRow.tsx',
      hrefPattern: /<Link\s+to=["']\/consultants\/\$id["']/,
    },
    // #3720.6 (épopée #3720, lot E03, 08/10, retour bêta SKAIZen 22/09) — même
    // défaut que #2719, trouvé ailleurs : « impossible d'ouvrir dans un nouvel
    // onglet depuis le tableau des contacts ou la création d'action ».
    {
      screen: 'Découvrir > Contacts — la ligne mène à la fiche contact',
      file: 'features/discover/view/ContactResultRow.tsx',
      hrefPattern: /<Link\s+to=["']\/contacts\/\$id["']/,
    },
    {
      screen: 'Centre d’actions, « Mes relances » — la ligne mène au plan du compte',
      file: 'features/actions/components/MyRelancesList.tsx',
      hrefPattern: /<Link\s+to=["']\/accounts\/\$id["']/,
    },
  ]

  it('le fichier existe dans le corpus des écrans', () => {
    const corpus = screens()
    for (const { screen, file } of ROW_NAVIGATES_TO_A_PAGE) {
      expect(
        corpus.some(entry => entry.path.endsWith(file)),
        `écran introuvable dans le corpus : ${screen} (${file})`,
      ).toBe(true)
    }
  })

  it('la ligne porte un vrai `<Link>`, jamais seulement un `onClick` + `navigate()`', () => {
    const offenders = ROW_NAVIGATES_TO_A_PAGE.filter(({ file, hrefPattern }) => {
      const source = stripComments(readFileSync(join(WEB_SRC, file), 'utf8'))
      return !hrefPattern.test(source)
    }).map(({ screen, file }) => `${screen} → ${file}`)
    expect(offenders, `lignes sans lien réel :\n${offenders.join('\n')}`).toEqual([])
  })

  /**
   * ⚠️ Le motif « metaKey … preventDefault » N'EST PAS fautif en soi — la
   * sélection au ctrl/cmd-clic (`handleContactRowMouseDown`) en porte un
   * légitime, sur `mousedown`, pour bloquer la sélection de texte pendant un
   * glisser. Une garde qui accuserait CE motif se tromperait de coupable
   * (leçon « une garde qui lit la prose accuse le bien »). Le vrai défaut
   * avait un NOM : `handleContactRowClick` annulait la navigation au clic
   * modifié plutôt que de la laisser au lien. C'est ce nom qu'on vise.
   */
  it('le clic modifié (ctrl/cmd) n’est plus annulé par le gestionnaire de clic retiré', () => {
    const contentSource = stripComments(
      readFileSync(join(WEB_SRC, 'features/contacts/view/ContactContent.tsx'), 'utf8'),
    )
    const rowSource = stripComments(
      readFileSync(join(WEB_SRC, 'features/contacts/view/contacts-list/ContactTableRow.tsx'), 'utf8'),
    )
    // Le gestionnaire qui annulait le geste : disparu.
    expect(contentSource).not.toMatch(/handleContactRowClick/)
    // Et la ligne ne branche plus AUCUN onClick de navigation — seul le
    // `<Link>` stopPropagation reste, `onClick` n'apparaît que sur lui et sur
    // les sous-éléments (case à cocher, mail, téléphone, menu).
    expect(rowSource).not.toMatch(/onClick=\{onRowClick\}/)
  })

  it('elle sait dire NON — un gestionnaire de clic réintroduit est détecté', () => {
    const fautif = 'const handleContactRowClick = (event) => {\n  if (event.metaKey) event.preventDefault()\n}'
    expect(/handleContactRowClick/.test(fautif)).toBe(true)
  })

  it('ne se laisse pas tromper par un exemple cité dans un commentaire', () => {
    const commente = '// avant : handleContactRowClick annulait le ctrl-clic — retiré par #2719'
    expect(/handleContactRowClick/.test(stripComments(commente))).toBe(false)
  })
})
