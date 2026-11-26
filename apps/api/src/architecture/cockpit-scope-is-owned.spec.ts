import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { UNASSIGNED_MISSIONS_SQL, can, financeScopeClause, financeScopeKindSchema } from '@bellum/contracts'

/**
 * « MON » COCKPIT EST VRAIMENT LE MIEN — ET LA ROUTE RESTE CELLE DE L'ESPACE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, MOT POUR MOT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le cockpit du commercial s'appelle « Mon activité », « **Mon** pipe », « **Mes**
 * missions en cours ». Deux de ses six blocs ne l'étaient pas :
 *
 *  · `GET /projects/pipeline` lisait `WHERE workspace_id = …` sans porteur ;
 *  · `GET /delivery/missions` était appelée SANS aucun paramètre.
 *
 * Sur une ESN à cinq commerciaux, « Mon pipe » mentait cinq fois. C'était la
 * seule chose FAUSSE À L'ÉCRAN plutôt qu'absente — et un chiffre juste sur le
 * mauvais périmètre est pire qu'un chiffre absent, parce qu'il ne se remarque
 * pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE GESTE, ET CE QUE CETTE GARDE EMPÊCHE DE DÉFAIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le geste juste n'est PAS « la route devient personnelle » : les deux routes ont
 * d'autres lecteurs légitimes à l'échelle de l'ESPACE — l'écran `/projects` (le
 * pipe complet, c'est son objet), l'état vide de `/missions`, l'écran
 * `/missions`, et le pont du copilote. C'est **l'appelant qui dit quel périmètre
 * il demande** (`?scope=own|workspace`, défaut « espace »).
 *
 * Cinq choses se défont toutes seules si personne ne les tient :
 *
 *  1. le paramètre existe mais n'est jamais PASSÉ au service (cause racine
 *     « paramètre déclaré, jamais passé », déjà trois fois dans ce dépôt) ;
 *  2. le défaut bascule sur « own » et change la réponse des lecteurs d'espace
 *     sans que personne ne l'ait décidé ;
 *  3. quelqu'un RECOPIE la condition de périmètre au lieu d'appeler la seule qui
 *     existe — une portée trop large recopiée de travers rend juste une liste
 *     plus longue, qui a l'air juste ;
 *  4. le compte « rattaché à personne » disparaît, et un pipe restreint qui tombe
 *     à zéro se relit « je n'ai rien vendu » ;
 *  5. quelqu'un met le montant du pipe sous droit financier — voir le dernier
 *     bloc, qui explique pourquoi ce serait FAUX.
 */

const API = join(__dirname, '..')
const PIPELINE_SERVICE = join(API, 'modules', 'projects', 'project-pipeline.service.ts')
const PROJECTS_CONTROLLER = join(API, 'modules', 'projects', 'projects.controller.ts')
const DELIVERY_SERVICE = join(API, 'modules', 'delivery', 'delivery.service.ts')
const DELIVERY_CONTROLLER = join(API, 'modules', 'delivery', 'delivery.controller.ts')
const COPILOT_BRIDGE = join(API, 'modules', 'copilot-bridge', 'copilot-bridge.controller.ts')

const pipelineService = readFileSync(PIPELINE_SERVICE, 'utf8')
const projectsController = readFileSync(PROJECTS_CONTROLLER, 'utf8')
const deliveryService = readFileSync(DELIVERY_SERVICE, 'utf8')
const deliveryController = readFileSync(DELIVERY_CONTROLLER, 'utf8')
const copilotBridge = readFileSync(COPILOT_BRIDGE, 'utf8')

const CORPUS = [
  ['project-pipeline.service.ts', pipelineService],
  ['projects.controller.ts', projectsController],
  ['delivery.service.ts', deliveryService],
  ['delivery.controller.ts', deliveryController],
  ['copilot-bridge.controller.ts', copilotBridge],
] as const

/**
 * Le corps qui suit un marqueur, coupé AVANT le membre suivant.
 *
 * Recopié de `propagation-source-link.spec.ts`, et pour la même raison : sans
 * cette découpe, chercher `@Query(` « dans le contrôleur » rendrait VRAI grâce à
 * une AUTRE route. Un marqueur absent rend la chaîne VIDE, jamais le fichier
 * entier — le faux zéro inverse ferait passer n'importe quelle assertion.
 */
const NEXT_ROUTE = /@(?:Get|Post|Patch|Put|Delete)\s*\(/
const NEXT_METHOD = /\n {2}(?:private|public|protected|async|[a-zA-Z]\w*\s*\()/

function bodyAfter(source: string, marker: string, stopAt: RegExp): string {
  const start = source.indexOf(marker)
  if (start < 0) return ''
  const rest = source.slice(start + marker.length)
  const next = rest.search(stopAt)
  return next < 0 ? rest : rest.slice(0, next)
}

/**
 * La condition de périmètre écrite À LA MAIN, sous les formes que ce dépôt
 * emploie réellement.
 *
 * Écrite contre le SQL du dépôt (paramètres positionnels, `::uuid` explicite) et
 * non contre une syntaxe imaginée : une garde qui surveille une forme que
 * personne n'écrit est borgne par construction.
 *
 * ⚠️ Elle ne mord PAS sur `owner_id IS NULL` : « rattaché à personne » est un
 * AUTRE énoncé, il vit dans ces fichiers, et il est vérifié plus bas.
 */
const HAND_WRITTEN_PERIMETER = [
  { name: 'owner_id comparé à un paramètre', pattern: /owner_id\s*=\s*\$\d/ },
  { name: 'assigned_to comparé à un paramètre', pattern: /assigned_to\s*=\s*\$\d/ },
]

describe('le cockpit demande SON périmètre, la route rend celui de l’espace', () => {
  /* ---------------------------------------------------------------------- */
  /*  La garde LIT quelque chose                                            */
  /* ---------------------------------------------------------------------- */

  it('a un corpus — cinq fichiers réels, non vides, et ce sont les bons', () => {
    // Le faux zéro silencieux : un chemin qui n'existe pas rend une chaîne vide,
    // zéro faute, et un test vert pour toujours.
    for (const [name, source] of CORPUS) {
      expect(`${name}:${source.length > 2000}`).toBe(`${name}:true`)
    }
    expect(pipelineService).toContain('class ProjectPipelineService')
    expect(deliveryService).toContain('class DeliveryService')
    expect(projectsController).toContain("@Get('pipeline')")
    expect(deliveryController).toContain("@Get('missions')")
  })

  /* ---------------------------------------------------------------------- */
  /*  1 — l'appelant DIT son périmètre, et la route le PASSE                 */
  /* ---------------------------------------------------------------------- */

  it('`GET /projects/pipeline` lit `scope` et le PASSE au service', () => {
    const handler = bodyAfter(projectsController, "@Get('pipeline')", NEXT_ROUTE)
    expect(handler.length).toBeGreaterThan(100)
    expect(handler).toContain("@Query('scope')")
    // Lu ET passé : un paramètre lu pour rien ne filtre rien.
    expect(handler).toContain('readPipelineScope(')
    expect(handler).toContain('this.pipeline.summary(')
  })

  it('`GET /delivery/missions` lit `scope` et le PASSE au service', () => {
    const handler = bodyAfter(deliveryController, "@Get('missions')", NEXT_ROUTE)
    expect(handler.length).toBeGreaterThan(100)
    expect(handler).toContain('@Query(')
    expect(handler).toContain('scope: readListScope(')
    expect(handler).toContain('this.delivery.list(')
  })

  it('les deux services SAVENT restreindre — le paramètre arrive jusqu’au SQL', () => {
    const summary = bodyAfter(pipelineService, 'async summary(', NEXT_METHOD)
    const list = bodyAfter(deliveryService, 'async list(', NEXT_METHOD)
    expect(summary.length).toBeGreaterThan(200)
    expect(list.length).toBeGreaterThan(200)
    for (const body of [summary, list]) {
      expect(body).toContain("scope.kind === 'own'")
    }
    expect(summary).toContain('financeScopeClause(')
    // Côté missions la clause vit dans le collecteur d'identifiants du
    // portefeuille, appelé depuis `list`.
    expect(list).toContain('missionIdsInPortfolio(')
    expect(deliveryService).toContain('financeScopeClause(')
  })

  it('la portée n’a que deux valeurs, et elles viennent du CONTRAT', () => {
    // Une liste recopiée dérive du jour où une troisième portée arrive.
    for (const source of [projectsController, deliveryController]) {
      expect(source).toContain('financeScopeKindSchema')
    }
    expect(financeScopeKindSchema.safeParse('own').success).toBe(true)
    expect(financeScopeKindSchema.safeParse('workspace').success).toBe(true)
    expect(financeScopeKindSchema.safeParse('everyone').success).toBe(false)
  })

  /* ---------------------------------------------------------------------- */
  /*  2 — le DÉFAUT reste l'espace : aucun appelant ne change en silence     */
  /* ---------------------------------------------------------------------- */

  it('le défaut des deux services est « l’espace »', () => {
    // Un défaut « own » changerait la réponse de l'écran `/projects`, de l'état
    // vide de `/missions`, de l'écran `/missions` et du copilote — quatre
    // lecteurs, aucune décision.
    expect(pipelineService).toContain("scope: PipelineScope = { kind: 'workspace' }")
    expect(deliveryService).toContain("options.scope ?? { kind: 'workspace' }")
  })

  it('le pont du copilote ne demande AUCUNE portée — il parle de l’espace, et il le dit', () => {
    const pipeline = bodyAfter(copilotBridge, "@Post('pipeline/summary')", NEXT_ROUTE)
    const risks = bodyAfter(copilotBridge, "@Post('missions/risks')", NEXT_ROUTE)
    expect(pipeline.length).toBeGreaterThan(50)
    expect(risks.length).toBeGreaterThan(50)
    for (const handler of [pipeline, risks]) {
      expect(handler).not.toContain('scope:')
      expect(handler).not.toContain("'own'")
    }
  })

  /* ---------------------------------------------------------------------- */
  /*  3 — « mon périmètre » est défini UNE fois                              */
  /* ---------------------------------------------------------------------- */

  it('ni le pipe ni les missions ne RECOPIENT la condition de périmètre', () => {
    const copied: string[] = []
    for (const [name, source] of [
      ['project-pipeline.service.ts', pipelineService],
      ['delivery.service.ts', deliveryService],
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
          'Une portée trop LARGE recopiée de travers rend juste un chiffre plus gros, qui a l’air juste.',
        ].join('\n'),
      )
    }
    expect(copied).toEqual([])
  })

  it('la clause dit bien les DEUX rattachements — la garde ne protège pas un vide', () => {
    // Une garde qui interdit de recopier une règle doit vérifier que la règle
    // qu'elle protège dit quelque chose.
    const { sql, params } = financeScopeClause({ kind: 'own', workspaceId: 'ws-1', userId: 'u-1' }, 'm', 2)
    expect(sql).toContain('m.owner_id = $2::uuid')
    expect(sql).toContain('a.assigned_to = $2::uuid')
    expect(params).toEqual(['u-1'])
    expect(financeScopeClause({ kind: 'workspace', workspaceId: 'ws-1' }, 'm', 2)).toEqual({ sql: '', params: [] })
  })

  /* ---------------------------------------------------------------------- */
  /*  4 — « rattaché à personne » dit la même chose des deux côtés           */
  /* ---------------------------------------------------------------------- */

  /**
   * `PROJECTS_OUTSIDE_ANY_PORTFOLIO_SQL` est la transposition à `opportunities`
   * de `UNASSIGNED_MISSIONS_SQL` — même règle, autre table, exactement comme
   * `contacts.assigned_to` est la transposition de `accounts.assigned_to`.
   *
   * Ce qu'on tient ici : les deux énoncés restent LE MÊME. S'ils divergent, un
   * commercial verrait « 3 projets hors périmètre » et « 0 mission hors
   * périmètre » sur le même espace, sans qu'aucun des deux ne soit faux
   * séparément.
   */
  it('le compte « rattaché à personne » est le même énoncé pour le pipe et les missions', () => {
    const projectsSql = bodyAfter(pipelineService, 'PROJECTS_OUTSIDE_ANY_PORTFOLIO_SQL = `', /`\s*\n/)
    expect(projectsSql.length).toBeGreaterThan(100)
    for (const sql of [projectsSql, UNASSIGNED_MISSIONS_SQL]) {
      expect(sql).toContain('COUNT(*)')
      expect(sql).toContain('owner_id IS NULL')
      expect(sql).toContain('NOT EXISTS')
      // ⚠️ `IS NOT NULL` et non `IS NULL` : la question est « existe-t-il un
      // compte porteur ATTRIBUÉ ? », pas « ce compte-ci est-il vide ? ».
      expect(sql).toContain('assigned_to IS NOT NULL')
    }
  })

  it('les deux services RENDENT le compte, et `null` sur la portée « espace »', () => {
    // Sans lui, « Mon pipe : 0 » se lit « je n'ai rien vendu » alors que la
    // vérité est « rien ne m'est rattaché ». Les deux appellent des gestes
    // opposés : prospecter, ou réclamer son portefeuille.
    for (const source of [pipelineService, deliveryService]) {
      expect(source).toContain('outsideAnyPortfolio')
    }
    expect(pipelineService).toContain("scope.kind === 'own' ? this.projectsOutsideAnyPortfolio(workspaceId) : Promise")
    expect(deliveryService).toContain(
      "scope.kind === 'own' ? await this.missionsOutsideAnyPortfolio(workspaceId) : null",
    )
  })

  /* ---------------------------------------------------------------------- */
  /*  5 — le montant du pipe N'EST PAS sous droit financier, et c'est décidé  */
  /* ---------------------------------------------------------------------- */

  /**
   * ⚠️ LA SOURCE SE TROMPE, ET C'EST TRANCHÉ ICI.
   *
   * Le PDF 2 du dossier du 26/08 décrit un état « sans droit financier » où les
   * blocs 1, 2 et 4 du cockpit disparaissent. Le bloc 1 est « Mon pipe », servi
   * par `GET /projects/pipeline`, et il ne disparaît pas. Deux raisons, toutes
   * deux MESURÉES dans ce dépôt plutôt qu'affirmées :
   *
   *  1. La ligne que `finance:read` protège est déjà tracée, et le montant du
   *     pipe est du bon côté : ce qui se garde est la MARGE et le COÛT CHARGÉ
   *     (qui relève de la paie). Le montant VENDU sort sans permission —
   *     `GET /delivery/missions` rend le tarif vendu à tout membre et ne vide
   *     que `marginPercent` (D45). Un montant de pipe est un montant vendu
   *     ESPÉRÉ.
   *  2. `sales` ne porte PAS `finance:read`. Garder cette route derrière lui
   *     fermerait l'écran `/projects` au commercial dont c'est le pipe : le
   *     geste censé le protéger lui retirerait son outil.
   *
   * Noté pour que la prochaine relecture de la source ne le re-signale pas.
   */
  it('`sales` n’a pas `finance:read` — garder le pipe derrière lui fermerait sa porte', () => {
    // La garde LIT la matrice, elle ne croit pas le paragraphe au-dessus.
    expect(can('sales', [], 'finance:read')).toBe(false)
    expect(can('sales', [], 'finance:read:own')).toBe(true)
    // Et le droit financier existe bien : la garde ne se rassure pas sur un
    // nom inventé, qui rendrait `false` pour la mauvaise raison.
    expect(can('owner', [], 'finance:read')).toBe(true)
  })

  it('la route du pipe ne porte AUCUNE permission financière — délibérément', () => {
    const handler = bodyAfter(projectsController, "@Get('pipeline')", NEXT_ROUTE)
    expect(handler.length).toBeGreaterThan(100)
    expect(handler).not.toContain('@RequirePermission')
    expect(handler).not.toContain('finance:read')
  })

  it('la marge, elle, reste gardée — la distinction droit / mesure est intacte', () => {
    const listHandler = bodyAfter(deliveryController, "@Get('missions')", NEXT_ROUTE)
    // `canReadFinance` et `scope` répondent à DEUX questions et voyagent tous
    // les deux : « pas le droit » fait demander un accès, « pas mesuré » fait
    // saisir une donnée, « rien ne m'est rattaché » fait réclamer un
    // portefeuille. Les fondre en un seul champ perdrait deux des trois.
    expect(listHandler).toContain("can(role, extra, 'finance:read')")
    expect(listHandler).toContain('scope:')
    expect(deliveryService).toContain('canReadFinance: options.canReadFinance')
  })

  /* ---------------------------------------------------------------------- */
  /*  La garde sait dire NON                                                */
  /* ---------------------------------------------------------------------- */

  it('reconnaît une condition de périmètre RECOPIÉE à la main', () => {
    // Preuve que les motifs mordent. Sans ce test, la garde pourrait surveiller
    // une syntaxe que personne n'écrit et rester verte pour toujours.
    const fautifs = [
      `WHERE m.workspace_id = $1 AND m.owner_id = $2::uuid`,
      `AND (o.owner_id = $2 OR a.assigned_to = $2)`,
      `EXISTS (SELECT 1 FROM accounts a WHERE a.assigned_to = $3::uuid)`,
    ]
    const manqués = fautifs.filter(line => !HAND_WRITTEN_PERIMETER.some(form => form.pattern.test(line)))
    expect(manqués).toEqual([])
  })

  it('ne mord PAS sur « rattaché à personne » — une garde qui refuse tout ne protège rien', () => {
    const légitimes = [
      `AND o.owner_id IS NULL`,
      `SELECT 1 FROM accounts a WHERE a.id = o.account_id AND a.assigned_to IS NOT NULL`,
      `/** Porteur du projet. NULL = non attribué — l'état honnête de départ. */`,
      `const own = financeScopeClause({ kind: 'own', workspaceId, userId }, 'm', 2)`,
    ]
    const fauxPositifs = légitimes.filter(line => HAND_WRITTEN_PERIMETER.some(form => form.pattern.test(line)))
    expect(fauxPositifs).toEqual([])
  })

  it('reconnaît un gestionnaire qui IGNORE la portée — la découpe sait dire NON', () => {
    // La forme exacte du défaut corrigé : la route lit la requête pour ses
    // filtres et ne passe aucune portée.
    const faux = `
      @Get('missions')
      async list(@CurrentUser() user: CurrentUserPayload, @Query() query: Record<string, string | undefined>) {
        return this.delivery.list(user.userId, { canReadFinance: false, filters: readPropagationFilters(query) })
      }

      @Get('renewals')
      renewals(@CurrentUser() user: CurrentUserPayload) { return this.delivery.renewalsToAct(user.userId) }
    `
    const handler = bodyAfter(faux, "@Get('missions')", NEXT_ROUTE)
    expect(handler).toContain('@Query(')
    // Le point : `@Query(` seul ne prouve RIEN. C'est `scope:` qui compte.
    expect(handler).not.toContain('scope: readListScope(')
    expect(handler).not.toContain("@Get('renewals')")
  })

  it('reconnaît un pont de copilote qui se serait mis à demander une portée', () => {
    const faux = `
      @Post('pipeline/summary')
      async pipelineSummary(@Body() dto: CopilotPipelineDto) {
        return this.pipeline.summary(workspaceId, 'fr', { kind: 'own', userId: dto.userId })
      }
    `
    const handler = bodyAfter(faux, "@Post('pipeline/summary')", NEXT_ROUTE)
    expect(handler).toContain("'own'")
  })

  it('rend une chaîne VIDE quand le marqueur n’existe pas — jamais tout le fichier', () => {
    // Le faux zéro inverse : une découpe qui rendrait le fichier entier ferait
    // passer n'importe quelle assertion.
    expect(bodyAfter(projectsController, "@Get('route-qui-n-existe-pas')", NEXT_ROUTE)).toBe('')
    expect(bodyAfter(deliveryService, 'async methode-qui-n-existe-pas(', NEXT_METHOD)).toBe('')
  })
})
