import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { can, financeScopeClause, financeScopeKindSchema } from '@bellum/contracts'

/**
 * « MON CHIFFRE D'AFFAIRES » EST VRAIMENT LE MIEN — ET LA ROUTE RESTE CELLE DE
 * L'ESPACE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, MOT POUR MOT
 * ─────────────────────────────────────────────────────────────────────────────
 * `FinanceController.financeScope()` DÉDUISAIT la portée du seul droit :
 *
 *     if (can(role, extra, 'finance:read')) return { kind: 'workspace', … }
 *
 * Quiconque porte `finance:read` — `owner`, `admin`, `finance` — recevait donc
 * l'espace entier, sans que personne ne lui ait demandé ce qu'il voulait. Le
 * bloc 2 du cockpit s'appelle « **Mon** chiffre d'affaires » : sur un siège de
 * responsable, il montrait celui de toute l'ESN.
 *
 * C'est le MÊME défaut que celui du pipe et des missions, un bloc plus loin. Il
 * n'avait pas été corrigé avec eux parce que ce contrôleur était hors du
 * périmètre de ce lot-là.
 *
 * Le droit n'est pas la demande. `finance:read` dit « a le DROIT de voir
 * l'espace », pas « veut voir l'espace ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE GESTE, ET CE QUE CETTE GARDE EMPÊCHE DE DÉFAIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le geste juste n'est PAS « les routes deviennent personnelles » : elles ont un
 * autre lecteur parfaitement légitime à l'échelle de l'ESPACE — l'écran
 * `/pilotage/finance`, dont l'objet EST le chiffre de l'ESN. C'est donc
 * l'APPELANT qui dit quel périmètre il demande (`?scope=own|workspace`, défaut
 * « l'espace »).
 *
 * Cinq choses se défont toutes seules si personne ne les tient :
 *
 *  1. le paramètre existe mais n'est jamais PASSÉ à la résolution (cause racine
 *     « paramètre déclaré, jamais passé », déjà trois fois dans ce dépôt) ;
 *  2. le défaut bascule sur « own » et change la réponse de `/pilotage/finance`
 *     sans que personne ne l'ait décidé ;
 *  3. la demande se met à ÉLARGIR — un `?scope=workspace` qui ouvrirait l'espace
 *     à qui n'a que `finance:read:own` serait une élévation de privilège écrite
 *     dans une URL ;
 *  4. quelqu'un RECOPIE la condition de périmètre au lieu d'appeler la seule qui
 *     existe. Ce n'est pas théorique : la ligne « espéré » du prévisionnel
 *     l'avait fait, et sa version à la main avait PERDU un des deux volets ;
 *  5. les trois refus écrits — capacité, marge par canal, délai de paiement —
 *     se font ouvrir « pour l'uniformité ».
 */

const API = join(__dirname, '..')
const FINANCE_CONTROLLER = join(API, 'modules', 'delivery', 'finance.controller.ts')
const REVENUE_SERVICE = join(API, 'modules', 'delivery', 'revenue.service.ts')
const SCORES_SERVICE = join(API, 'modules', 'delivery', 'mission-scores.service.ts')
const PROPAGATION_SERVICE = join(API, 'modules', 'delivery', 'propagation.service.ts')

const financeController = readFileSync(FINANCE_CONTROLLER, 'utf8')
const revenueService = readFileSync(REVENUE_SERVICE, 'utf8')
const scoresService = readFileSync(SCORES_SERVICE, 'utf8')
const propagationService = readFileSync(PROPAGATION_SERVICE, 'utf8')

const CORPUS = [
  ['finance.controller.ts', financeController],
  ['revenue.service.ts', revenueService],
  ['mission-scores.service.ts', scoresService],
  ['propagation.service.ts', propagationService],
] as const

/**
 * Le CODE, sans sa prose.
 *
 * ⚠️ Cette garde a trouvé son premier faux rouge sur elle-même : le commentaire
 * qui EXPLIQUE la forme fautive (`' AND a.assigned_to = $2::uuid'`) contient la
 * forme fautive. Une garde qui lit la prose accuse la documentation de ce
 * qu'elle documente — et, dans l'autre sens, se laisse rassurer par un
 * `@Query('scope')` cité dans un bloc de commentaire.
 *
 * Recopié de `forecast-lines.spec.ts`, qui porte déjà la même mise en garde
 * pour la même raison.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const financeControllerCode = code(financeController)
const revenueServiceCode = code(revenueService)
const scoresServiceCode = code(scoresService)
const propagationServiceCode = code(propagationService)

/**
 * Le corps qui suit un marqueur, coupé AVANT la route suivante.
 *
 * Sans cette découpe, chercher `@Query('scope')` « dans le contrôleur » rendrait
 * VRAI grâce à une AUTRE route — et c'est précisément ce qu'il faut distinguer
 * ici, puisque quatre routes doivent le lire et trois ne doivent pas.
 *
 * Un marqueur absent rend la chaîne VIDE, jamais le fichier entier : le faux
 * zéro inverse ferait passer n'importe quelle assertion.
 */
const NEXT_ROUTE = /@(?:Get|Post|Patch|Put|Delete)\s*\(/

function bodyAfter(source: string, marker: string, stopAt: RegExp): string {
  const start = source.indexOf(marker)
  if (start < 0) return ''
  const rest = source.slice(start + marker.length)
  const next = rest.search(stopAt)
  return next < 0 ? rest : rest.slice(0, next)
}

/**
 * Les QUATRE lectures qui savent restreindre, et le nom sous lequel leur
 * gestionnaire est déclaré.
 *
 * Elles sont nommées une à une plutôt que devinées : une garde qui découvrirait
 * les routes elle-même dirait « toutes celles qui lisent `scope` lisent
 * `scope` », ce qui est vrai de zéro route comme de quatre.
 */
const SCOPED_ROUTES = [
  { route: "@Get('revenue')", why: 'le bloc 2 du cockpit — « Mon chiffre d’affaires »' },
  { route: "@Get('margin')", why: 'la marge de MES missions, alertes comprises' },
  { route: "@Get('propagation')", why: 'le bandeau « ce client VOUS a rapporté X € »' },
  { route: "@Get('forecast')", why: 'le prévisionnel — « ce que J’AI devant moi »' },
] as const

/**
 * Les TROIS lectures qui restent d'ESPACE, avec le refus ÉCRIT qui les tient.
 *
 * Ce ne sont pas des oublis, et la garde ne se contente pas de constater qu'elles
 * ne lisent pas le paramètre : elle vérifie que la RAISON est toujours écrite à
 * côté. Un refus dont la raison disparaît se fait rouvrir au premier passage.
 */
const FINANCE_READ_ONLY = "@RequirePermission('finance:read')"
/**
 * ⚠️ RENVERSEMENT DATÉ du 11/10/2026 (Louis, épopée #4016 lot L8 : « le
 * commercial voit la capacité d'équipe », `c52_capacite_equipe`). La capacité
 * s'ouvre à `finance:read:own` : un siège `sales` la LIT, mais elle reste celle
 * de l'ÉQUIPE — toujours AUCUN `?scope=own`, et l'écran la dit « de l'équipe ».
 */
const FINANCE_READ_OR_OWN = "@RequirePermission('finance:read', 'finance:read:own')"
const WORKSPACE_ONLY_ROUTES = [
  { route: "@Get('dso')", why: 'une MÉDIANE à plancher d’observations, sur l’espace', permission: FINANCE_READ_ONLY },
  { route: "@Get('margin-by-channel')", why: 'elle compare les canaux de l’ESPACE', permission: FINANCE_READ_ONLY },
  { route: "@Get('capacity')", why: 'elle décrit l’ÉQUIPE', permission: FINANCE_READ_OR_OWN },
] as const

/**
 * Les refus, tels qu'ils sont ÉCRITS dans le contrôleur.
 *
 * Cherchés dans la prose et non dans le code, parce que c'est de la prose qu'il
 * s'agit : un refus dont la raison disparaît se fait rouvrir au premier passage,
 * « pour l'uniformité ».
 */
const WRITTEN_REFUSALS = [
  'AUCUN `?scope=own`',
  "elle décrit l'ÉQUIPE",
  'elle compare les canaux de',
  "plancher d'observations",
]

/**
 * La condition de périmètre écrite À LA MAIN, sous les formes que ce dépôt
 * emploie réellement.
 *
 * Écrite contre le SQL du dépôt (paramètres positionnels, `::uuid` explicite) et
 * non contre une syntaxe imaginée. La forme n'est pas hypothétique : elle a
 * existé, dans `mission-scores.service.ts`, sous la forme
 * `' AND a.assigned_to = $2::uuid'` — et elle avait perdu le volet `owner_id`.
 *
 * ⚠️ Elle ne mord PAS sur `owner_id IS NULL` : « rattaché à personne » est un
 * AUTRE énoncé, il vit dans ces fichiers, et il est légitime.
 */
const HAND_WRITTEN_PERIMETER = [
  { name: 'owner_id comparé à un paramètre', pattern: /owner_id\s*=\s*\$\d/ },
  { name: 'assigned_to comparé à un paramètre', pattern: /assigned_to\s*=\s*\$\d/ },
]

describe('le cockpit demande SON périmètre financier, la route rend celui de l’espace', () => {
  /* ---------------------------------------------------------------------- */
  /*  La garde LIT quelque chose                                            */
  /* ---------------------------------------------------------------------- */

  it('a un corpus — quatre fichiers réels, non vides, et ce sont les bons', () => {
    // Le faux zéro silencieux : un chemin qui n'existe pas rend une chaîne vide,
    // zéro faute, et un test vert pour toujours.
    for (const [name, source] of CORPUS) {
      expect(`${name}:${source.length > 2000}`).toBe(`${name}:true`)
    }
    expect(financeController).toContain('export class FinanceController')
    expect(revenueService).toContain('export class RevenueService')
    expect(scoresService).toContain('export class MissionScoresService')
    expect(propagationService).toContain('export class PropagationService')
  })

  it('les sept routes financières existent encore sous ces noms', () => {
    // Une route renommée ferait de toutes les assertions ci-dessous des tests
    // sur des chaînes vides — verts, et aveugles.
    for (const { route } of [...SCOPED_ROUTES, ...WORKSPACE_ONLY_ROUTES]) {
      expect(`${route}:${financeController.includes(route)}`).toBe(`${route}:true`)
    }
  })

  /* ---------------------------------------------------------------------- */
  /*  1 — l'appelant DIT son périmètre, et la route le PASSE                 */
  /* ---------------------------------------------------------------------- */

  it('les QUATRE routes restreignables lisent `scope` et le PASSENT à la résolution', () => {
    for (const { route, why } of SCOPED_ROUTES) {
      const handler = bodyAfter(financeControllerCode, route, NEXT_ROUTE)
      expect(`${route} (${why}) — corps trouvé : ${handler.length > 80}`).toBe(
        `${route} (${why}) — corps trouvé : true`,
      )
      expect(handler).toContain("@Query('scope')")
      // Lu ET passé : un paramètre lu pour rien ne restreint rien.
      expect(handler).toMatch(/this\.finance(Scope|Access)\(user\.userId, requestedScope\)/)
    }
  })

  it('la portée n’a que deux valeurs, et elles viennent du CONTRAT', () => {
    // Une liste recopiée dérive du jour où une troisième portée arrive.
    expect(financeController).toContain('financeScopeKindSchema')
    expect(financeScopeKindSchema.safeParse('own').success).toBe(true)
    expect(financeScopeKindSchema.safeParse('workspace').success).toBe(true)
    expect(financeScopeKindSchema.safeParse('everyone').success).toBe(false)
  })

  /* ---------------------------------------------------------------------- */
  /*  2 — le DÉFAUT reste l'espace, et la demande ne peut que RESSERRER      */
  /* ---------------------------------------------------------------------- */

  it('le défaut est « l’espace », et il est écrit sur la SEULE résolution', () => {
    const resolution = bodyAfter(financeControllerCode, 'private async financeAccess(', /\n {2}private /)
    expect(resolution.length).toBeGreaterThan(200)
    // Le droit reste le PLAFOND (`canReadFinance &&`), la demande choisit
    // dessous (`!wantsOwnScope(requested)`). Inverser l'un des deux rouvrirait
    // l'espace à qui n'y a pas droit, ou fermerait le pilotage à qui y a droit.
    expect(resolution).toContain('canReadFinance && !wantsOwnScope(requested)')
    expect(resolution).toContain("{ kind: 'workspace', workspaceId }")
    expect(resolution).toContain("{ kind: 'own', workspaceId, userId }")
  })

  it('une seule résolution existe — la portée ne se décide pas route par route', () => {
    // Sept routes qui décideraient chacune donneraient sept occasions de
    // diverger, et l'écart ne se verrait que sur un rôle donné.
    expect((financeControllerCode.match(/private async financeAccess\(/g) ?? []).length).toBe(1)
    expect((financeControllerCode.match(/function wantsOwnScope\(/g) ?? []).length).toBe(1)
  })

  /* ---------------------------------------------------------------------- */
  /*  3 — les trois refus écrits sont TENUS                                  */
  /* ---------------------------------------------------------------------- */

  it('les TROIS routes d’espace n’écoutent aucune portée', () => {
    for (const { route, why } of WORKSPACE_ONLY_ROUTES) {
      const handler = bodyAfter(financeControllerCode, route, NEXT_ROUTE)
      expect(`${route} (${why}) — corps trouvé : ${handler.length > 40}`).toBe(
        `${route} (${why}) — corps trouvé : true`,
      )
      expect(handler).not.toContain("@Query('scope')")
      // Elles reçoivent un `workspaceId` NU (`this.scope(…)`), jamais un objet
      // de portée : la forme même de l'argument porte le refus.
      expect(handler).toContain('this.scope(user.userId)')
    }
  })

  it('et les refus restent ÉCRITS — une garde protège une règle, elle ne l’invente pas', () => {
    // Ici on lit la PROSE exprès : c'est la raison qu'on garde, pas le code.
    // Les trois arbitrages datent du 26/08 et n'ont pas été re-litigés.
    for (const refusal of WRITTEN_REFUSALS) {
      expect(`${refusal} : ${financeController.includes(refusal)}`).toBe(`${refusal} : true`)
    }
  })

  /* ---------------------------------------------------------------------- */
  /*  4 — « mon périmètre » est défini UNE fois                              */
  /* ---------------------------------------------------------------------- */

  it('aucun service financier ne RECOPIE la condition de périmètre', () => {
    const copied: string[] = []
    for (const [name, source] of [
      ['revenue.service.ts', revenueServiceCode],
      ['mission-scores.service.ts', scoresServiceCode],
      ['propagation.service.ts', propagationServiceCode],
    ] as const) {
      for (const form of HAND_WRITTEN_PERIMETER) {
        if (form.pattern.test(source)) copied.push(`${name} → ${form.name}`)
      }
    }
    if (copied.length > 0) {
      throw new Error(
        [
          'La condition de « mon périmètre » a été recopiée : ' + copied.join(', '),
          'Elle vit à UN seul endroit — `financeScopeClause` (packages/contracts/src/schemas/finance-scope.ts) :',
          '  « je la porte (owner_id) OU le compte m’est attribué (accounts.assigned_to) ».',
          'La version à la main du prévisionnel avait PERDU le premier volet : un projet',
          'que je porte sur le compte d’un collègue sortait de mon prévisionnel.',
        ].join('\n'),
      )
    }
    expect(copied).toEqual([])
  })

  it('les trois services APPELLENT la clause unique — la garde ne protège pas un vide', () => {
    for (const [name, source] of [
      ['revenue.service.ts', revenueServiceCode],
      ['mission-scores.service.ts', scoresServiceCode],
      ['propagation.service.ts', propagationServiceCode],
    ] as const) {
      expect(`${name}:${source.includes('financeScopeClause(')}`).toBe(`${name}:true`)
    }
  })

  it('la clause dit bien les DEUX rattachements', () => {
    // Une garde qui interdit de recopier une règle doit vérifier que la règle
    // qu'elle protège dit quelque chose.
    const { sql, params } = financeScopeClause({ kind: 'own', workspaceId: 'ws-1', userId: 'u-1' }, 'm', 2)
    expect(sql).toContain('m.owner_id = $2::uuid')
    expect(sql).toContain('a.assigned_to = $2::uuid')
    expect(params).toEqual(['u-1'])
    expect(financeScopeClause({ kind: 'workspace', workspaceId: 'ws-1' }, 'm', 2)).toEqual({ sql: '', params: [] })
  })

  /* ---------------------------------------------------------------------- */
  /*  5 — « rattaché à personne » voyage, et il est compté UNE fois          */
  /* ---------------------------------------------------------------------- */

  it('le compte « hors de tout périmètre » se lit à UN seul endroit', () => {
    // `UNASSIGNED_MISSIONS_SQL` vit dans le contrat et n'est lu que par
    // `RevenueService.scopeInfo`. Le recompter ailleurs ferait deux énoncés du
    // même nombre, qui divergeraient sur les bornes.
    expect(revenueServiceCode).toContain('UNASSIGNED_MISSIONS_SQL')
    expect(scoresServiceCode).not.toContain('UNASSIGNED_MISSIONS_SQL')
    expect(propagationServiceCode).not.toContain('UNASSIGNED_MISSIONS_SQL')
    expect(financeControllerCode).not.toContain('UNASSIGNED_MISSIONS_SQL')
    // Et les quatre routes le SERVENT, en passant par ce seul lecteur.
    expect((financeControllerCode.match(/this\.revenue\.scopeInfo\(scope\)/g) ?? []).length).toBe(4)
  })

  it('`scope` et `canReadFinance` restent DEUX champs sur la propagation', () => {
    const handler = bodyAfter(financeControllerCode, "@Get('propagation')", NEXT_ROUTE)
    expect(handler.length).toBeGreaterThan(100)
    // « Pas le droit de voir la marge d'équipe » fait demander un accès ;
    // « rien ne m'est rattaché » fait réclamer un portefeuille. Les fondre en
    // un seul champ perdrait l'un des deux gestes.
    expect(handler).toContain('canReadFinance')
    expect(handler).toContain('scope: info')
  })

  /* ---------------------------------------------------------------------- */
  /*  6 — le droit financier n'est pas la portée, et la matrice le dit       */
  /* ---------------------------------------------------------------------- */

  it('`sales` n’a que `finance:read:own` — c’est ce qui rend le PLAFOND nécessaire', () => {
    // La garde LIT la matrice, elle ne croit pas la prose des commentaires.
    expect(can('sales', [], 'finance:read')).toBe(false)
    expect(can('sales', [], 'finance:read:own')).toBe(true)
    // Et les trois rôles pour qui le défaut mentait portent bien le droit large
    // — sans ça, la garde serait verte pour la mauvaise raison.
    for (const role of ['owner', 'admin', 'finance'] as const) {
      expect(`${role}:${can(role, [], 'finance:read')}`).toBe(`${role}:true`)
    }
  })

  /**
   * ⚠️ UN REFUS DE DROIT NE SE CONFOND PAS AVEC UN PÉRIMÈTRE VIDE.
   *
   * Les sept routes portent `@RequirePermission`, donc un rôle sans AUCUN droit
   * financier est refusé PAR LA PORTE : le gestionnaire ne tourne pas, la
   * résolution de portée n'a pas lieu, et l'écran reçoit un 403 — jamais un
   * `{ scope: { kind: 'own', … }, lines: [] }` qui se lirait « tu n'as rien
   * vendu ». C'est la distinction que `useFinancePropagation` exploite déjà
   * côté écran (`retry: false` sur un 403, et une phrase distincte).
   *
   * Ce que la garde tient ici : que la porte EXISTE sur les sept, et que les
   * quatre rôles sans droit financier soient bien refusés par la matrice — pas
   * seulement par la prose d'un commentaire.
   */
  it('un rôle SANS droit financier est refusé par la PORTE, pas par un périmètre vide', () => {
    for (const { route } of SCOPED_ROUTES) {
      const handler = bodyAfter(financeControllerCode, route, NEXT_ROUTE)
      expect(`${route} : ${handler.includes("@RequirePermission('finance:read', 'finance:read:own')")}`).toBe(
        `${route} : true`,
      )
    }
    for (const { route, permission } of WORKSPACE_ONLY_ROUTES) {
      const handler = bodyAfter(financeControllerCode, route, NEXT_ROUTE)
      expect(`${route} : ${handler.includes(permission)}`).toBe(`${route} : true`)
    }
    // Les quatre rôles qui n'ont NI l'un NI l'autre — dont `recruiter`, qui est
    // précisément celui qui ouvre le vivier et la fiche d'un consultant.
    for (const role of ['member', 'recruiter', 'tech_admin', 'viewer'] as const) {
      expect(`${role} large:${can(role, [], 'finance:read')}`).toBe(`${role} large:false`)
      expect(`${role} own:${can(role, [], 'finance:read:own')}`).toBe(`${role} own:false`)
    }
  })

  it('#4016 L8 — seule la capacité s’ouvre à `finance:read:own` ; les deux autres lectures d’espace restent fermées à `sales`', () => {
    const open = WORKSPACE_ONLY_ROUTES.filter(entry => entry.permission === FINANCE_READ_OR_OWN).map(e => e.route)
    expect(open).toEqual(["@Get('capacity')"])
    // `sales` la lit, une vue d'ÉQUIPE qui ne prend jamais `?scope=own`…
    expect(can('sales', [], 'finance:read:own')).toBe(true)
    const capacityHandler = bodyAfter(financeControllerCode, "@Get('capacity')", NEXT_ROUTE)
    expect(capacityHandler).not.toMatch(/@Query\(\s*['"]scope['"]/)
    // …et les rôles sans AUCUN droit financier ne la lisent toujours pas.
    for (const role of ['member', 'recruiter', 'tech_admin', 'viewer'] as const) {
      expect(`${role}:${can(role, [], 'finance:read') || can(role, [], 'finance:read:own')}`).toBe(`${role}:false`)
    }
  })

  /* ---------------------------------------------------------------------- */
  /*  La garde sait dire NON                                                */
  /* ---------------------------------------------------------------------- */

  it('reconnaît une condition de périmètre RECOPIÉE à la main', () => {
    // Preuve que les motifs mordent. Sans ce test, la garde pourrait surveiller
    // une syntaxe que personne n'écrit et rester verte pour toujours.
    // ⚠️ La première ligne est la forme RÉELLE qui vivait dans ce dépôt.
    const fautifs = [
      `{ sql: ' AND a.assigned_to = $2::uuid', params: [scope.userId] }`,
      `WHERE m.workspace_id = $1 AND m.owner_id = $2::uuid`,
      `AND (o.owner_id = $2 OR a.assigned_to = $2)`,
    ]
    const manqués = fautifs.filter(line => !HAND_WRITTEN_PERIMETER.some(form => form.pattern.test(line)))
    expect(manqués).toEqual([])
  })

  it('ne mord PAS sur « rattaché à personne » — une garde qui refuse tout ne protège rien', () => {
    const légitimes = [
      `AND m.owner_id IS NULL`,
      `SELECT 1 FROM accounts a WHERE a.id = m.account_id AND a.assigned_to IS NOT NULL`,
      `/** Porteur du projet. NULL = non attribué — l'état honnête de départ. */`,
      `const perimeter = financeScopeClause(scope, 'm', 3)`,
    ]
    const fauxPositifs = légitimes.filter(line => HAND_WRITTEN_PERIMETER.some(form => form.pattern.test(line)))
    expect(fauxPositifs).toEqual([])
  })

  it('reconnaît un gestionnaire qui LIT la portée sans la PASSER', () => {
    // La forme exacte du défaut jumeau : la route déclare le paramètre, et la
    // résolution ne le reçoit pas. « Paramètre déclaré, jamais passé » est une
    // cause racine nommée de ce dépôt.
    const faux = `
  @Get('revenue')
  @RequirePermission('finance:read', 'finance:read:own')
  async revenueBreakdown(@CurrentUser() user: CurrentUserPayload, @Query('scope') requestedScope?: string) {
    const scope = await this.financeScope(user.userId)
    return this.revenue.breakdown(scope, previousMonth())
  }

  @Get('dso')
  async dso(@CurrentUser() user: CurrentUserPayload) {
    return this.revenue.dso(await this.scope(user.userId))
  }
`
    const handler = bodyAfter(faux, "@Get('revenue')", NEXT_ROUTE)
    expect(handler).toContain("@Query('scope')")
    // Le point : `@Query('scope')` seul ne prouve RIEN.
    expect(handler).not.toMatch(/this\.finance(Scope|Access)\(user\.userId, requestedScope\)/)
    // Et la découpe s'arrête bien avant la route suivante.
    expect(handler).not.toContain("@Get('dso')")
  })

  it('reconnaît une route d’ESPACE qui se serait mise à écouter la portée', () => {
    const faux = `
  @Get('capacity')
  @RequirePermission('finance:read')
  async capacity(@CurrentUser() user: CurrentUserPayload, @Query('scope') requestedScope?: string) {
    return this.scores.capacity(await this.financeScope(user.userId, requestedScope), currentMonth())
  }
`
    const handler = bodyAfter(faux, "@Get('capacity')", NEXT_ROUTE)
    expect(handler).toContain("@Query('scope')")
    expect(handler).not.toContain('this.scope(user.userId)')
  })

  it('la PROSE ne peut ni accuser ni rassurer — `code()` la retire', () => {
    // ⚠️ Ce test est né d'un vrai faux rouge : la garde accusait
    // `mission-scores.service.ts` d'avoir recopié la condition de périmètre,
    // alors que la seule occurrence restante était le COMMENTAIRE qui explique
    // pourquoi elle a été retirée. Une garde qui lit la prose accuse la
    // documentation de ce qu'elle documente — et, dans l'autre sens, se laisse
    // rassurer par un `@Query('scope')` cité dans un bloc de commentaire.
    const piégé = `
  /** ⚠️ Ne JAMAIS écrire \` AND a.assigned_to = $2::uuid\`, ni lire @Query('scope') ici. */
  private async sans(workspaceId: string) {
    return this.missions.manager.query('SELECT 1', [workspaceId]) // owner_id = $2 en commentaire
  }
`
    const stripped = code(piégé)
    expect(piégé).toContain('assigned_to = $2::uuid')
    expect(stripped).not.toContain('assigned_to = $2')
    expect(stripped).not.toContain("@Query('scope')")
    expect(stripped).not.toContain('owner_id = $2')
    // Et le CODE, lui, survit — un décapage qui viderait le fichier rendrait
    // tous les `not.toContain` verts pour toujours.
    expect(stripped).toContain("this.missions.manager.query('SELECT 1', [workspaceId])")
  })

  it('rend une chaîne VIDE quand le marqueur n’existe pas — jamais tout le fichier', () => {
    // Le faux zéro inverse : une découpe qui rendrait le fichier entier ferait
    // passer n'importe quelle assertion.
    expect(bodyAfter(financeControllerCode, "@Get('route-qui-n-existe-pas')", NEXT_ROUTE)).toBe('')
    expect(bodyAfter(revenueServiceCode, 'private async methode-qui-n-existe-pas(', NEXT_ROUTE)).toBe('')
  })
})
