import { FinanceController } from './finance.controller'
import { MissionScoresService } from './mission-scores.service'
import { RevenueService } from './revenue.service'

/**
 * La portée financière du contrôleur (D1 · 26/08/2026).
 *
 * Ce qui se teste ici n'est pas le SQL — il l'est dans le contrat — mais la
 * RÉSOLUTION : qui obtient l'espace entier, qui obtient son seul périmètre, et
 * ce que la réponse en dit.
 *
 * Le risque asymétrique porte le test : une portée trop LARGE rend un chiffre
 * plus gros, qui a l'air juste, et ouvre la marge d'un collègue.
 */
function build(options: { role?: string; extra?: string[] } = {}) {
  const breakdown = jest.fn().mockResolvedValue({ periodMonth: '2026-07-01', lines: [] })
  const aggregate = jest.fn().mockResolvedValue({ marginPercent: null, measured: 0, unmeasured: 0 })
  const marginAlerts = jest.fn().mockResolvedValue({ threshold: null, items: [] })
  // ⚠️ Le faux ÉCHOTE la portée qu'il reçoit, au lieu de rendre toujours la
  // même : une réponse figée à `{kind:'own'}` ferait passer au vert un
  // contrôleur qui aurait choisi `workspace`, et c'est exactement le défaut
  // qu'on corrige. `null` sur l'espace, comme le vrai service.
  const scopeInfo = jest
    .fn()
    .mockImplementation(async (scope: { kind: string }) =>
      scope.kind === 'workspace'
        ? { kind: 'workspace', outsideAnyPortfolio: null }
        : { kind: 'own', outsideAnyPortfolio: 4 },
    )
  const marginByChannel = jest.fn().mockResolvedValue([])
  const dso = jest.fn().mockResolvedValue({ days: null })
  const revenue = { breakdown, aggregate, marginAlerts, scopeInfo, marginByChannel, dso } as never

  const forecast = jest.fn().mockResolvedValue({ months: [], lines: [] })
  const capacity = jest.fn().mockResolvedValue({})
  // La marge du prévisionnel CONTRACTUALISÉ voyage avec le prévisionnel depuis
  // le 01/09/2026 : elle suit la même portée, et son propre test vit dans
  // `finance-entity-filter.spec.ts`.
  const contractedMargin = jest
    .fn()
    .mockResolvedValue({ marginPercent: null, measured: 0, unmeasured: 0, measurability: null })
  const scores = { forecast, capacity, contractedMargin } as never

  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: options.role ?? 'sales' }),
    extraPermissionsOf: jest.fn().mockResolvedValue(options.extra ?? []),
  } as never

  const financeDigest = jest.fn().mockResolvedValue({ accounts: [], consultants: [], canReadFinance: false })
  const propagation = { financeDigest } as never

  const horizons = { compute: jest.fn() } as never

  const controller = new FinanceController(revenue, scores, propagation, workspaceContext, horizons)
  return {
    controller,
    breakdown,
    aggregate,
    marginAlerts,
    scopeInfo,
    forecast,
    financeDigest,
    // Les trois lectures qui restent d'ESPACE : elles reçoivent un
    // `workspaceId` NU et jamais un objet de portée — c'est la forme de leur
    // premier argument qui porte le refus, pas un commentaire.
    capacity,
    marginByChannel,
    dso,
  }
}

const USER = { userId: 'u-1' } as never

describe('portée financière — qui voit quoi', () => {
  it('un COMMERCIAL ne voit que son périmètre', async () => {
    const { controller, breakdown } = build({ role: 'sales' })
    await controller.revenueBreakdown(USER, '2026-07')
    expect(breakdown).toHaveBeenCalledWith({ kind: 'own', workspaceId: 'ws-1', userId: 'u-1' }, '2026-07', null)
  })

  it('un RESPONSABLE voit l’espace entier', async () => {
    // `finance:read` gagne toujours : un owner qui verrait moins que son droit
    // chercherait la panne.
    const { controller, breakdown } = build({ role: 'owner' })
    await controller.revenueBreakdown(USER, '2026-07')
    expect(breakdown).toHaveBeenCalledWith({ kind: 'workspace', workspaceId: 'ws-1' }, '2026-07', null)
  })

  it('une permission accordée MEMBRE PAR MEMBRE élargit la portée', async () => {
    // Les permissions additives ignorées ici seraient sans effet — le défaut
    // trouvé sur la liste des missions le 22/08.
    const { controller, breakdown } = build({ role: 'sales', extra: ['finance:read'] })
    await controller.revenueBreakdown(USER, '2026-07')
    expect(breakdown).toHaveBeenCalledWith({ kind: 'workspace', workspaceId: 'ws-1' }, '2026-07', null)
  })

  it('la marge et le prévisionnel suivent la MÊME portée', async () => {
    const { controller, aggregate, marginAlerts, forecast } = build({ role: 'sales' })
    await controller.margin(USER, '2026-07')
    await controller.forecast(USER, '3')
    const own = { kind: 'own', workspaceId: 'ws-1', userId: 'u-1' }
    expect(aggregate).toHaveBeenCalledWith(own, '2026-07', null)
    expect(marginAlerts).toHaveBeenCalledWith(own, null)
    expect(forecast).toHaveBeenCalledWith(own, 3, null)
  })

  it('le CA cumulé par compte suit la MÊME portée que sa ligne de chiffre d’affaires', async () => {
    // Le bandeau « ce client vous a rapporté X € » est l'agrégat PAR COMPTE de
    // la ligne « facturé ». Le servir sous une portée plus large que sa ligne
    // ferait lire à un commercial le chiffre de ses collègues sur la fiche d'un
    // compte qui ne lui est pas attribué.
    const { controller, financeDigest } = build({ role: 'sales' })
    await controller.propagation(USER)
    expect(financeDigest).toHaveBeenCalledWith({ kind: 'own', workspaceId: 'ws-1', userId: 'u-1' }, false)
  })

  it('la marge par consultant n’est LISIBLE qu’avec `finance:read` — elle décrit l’équipe', async () => {
    // Même raison que `capacity` et `margin-by-channel` : un consultant n'a pas
    // de propriétaire commercial. `finance:read:own` ouvre le CA de SES comptes,
    // jamais la marge de l'équipe — le second argument est le droit qui décide.
    const own = build({ role: 'sales' })
    await own.controller.propagation(USER)
    expect(own.financeDigest.mock.calls[0]?.[1]).toBe(false)

    const full = build({ role: 'owner' })
    await full.controller.propagation(USER)
    expect(full.financeDigest.mock.calls[0]?.[1]).toBe(true)
  })

  it('une permission accordée MEMBRE PAR MEMBRE ouvre aussi la marge par consultant', async () => {
    const { controller, financeDigest } = build({ role: 'sales', extra: ['finance:read'] })
    await controller.propagation(USER)
    expect(financeDigest).toHaveBeenCalledWith({ kind: 'workspace', workspaceId: 'ws-1' }, true)
  })
})

describe('portée financière — ce que la réponse en DIT', () => {
  it('la portée voyage AVEC les chiffres, sur les QUATRE routes', async () => {
    // Sans elle, un commercial dont rien n'est attribué lirait « 0 € » et en
    // conclurait qu'il n'a rien vendu.
    //
    // ⚠️ QUATRE et non trois : `propagation` porte `finance:read:own` depuis le
    // 26/08 et restreint bien son CA par compte — elle était la seule des
    // quatre à ne rien dire du périmètre servi, si bien qu'une liste de comptes
    // vide se lisait « ces clients ne vous ont rien rapporté ».
    const { controller } = build({ role: 'sales' })
    const revenue = (await controller.revenueBreakdown(USER, '2026-07')) as { scope: unknown }
    const margin = (await controller.margin(USER, '2026-07')) as { scope: unknown }
    const forecast = (await controller.forecast(USER, '3')) as { scope: unknown }
    const propagation = await controller.propagation(USER)
    for (const response of [revenue, margin, forecast, propagation]) {
      expect(response.scope).toEqual({ kind: 'own', outsideAnyPortfolio: 4 })
    }
  })

  it('`scope` et `canReadFinance` restent DEUX champs — le rattachement est un TROISIÈME état', async () => {
    // « Pas le droit de voir la marge d'équipe » fait demander un accès ;
    // « rien ne m'est rattaché » fait réclamer un portefeuille. Les fondre en un
    // seul champ perdrait l'un des deux gestes.
    const { controller } = build({ role: 'sales' })
    const propagation = await controller.propagation(USER)
    expect(propagation.canReadFinance).toBe(false)
    expect(propagation.scope).toEqual({ kind: 'own', outsideAnyPortfolio: 4 })
  })
})

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  « MON chiffre d'affaires » est vraiment le mien                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Le défaut, mesuré le 28/08/2026 : `financeScope()` rendait `{kind:'workspace'}`
 * à QUICONQUE porte `finance:read` — `owner`, `admin`, `finance`. Le bloc 2 du
 * cockpit s'appelle « **Mon** chiffre d'affaires » et montrait donc, sur un siège
 * de responsable, celui de toute l'ESN. Un chiffre juste sur le mauvais
 * périmètre est pire qu'un chiffre absent : il ne se remarque pas.
 *
 * Le droit n'est pas la demande. `finance:read` dit « a le DROIT de voir
 * l'espace », pas « veut voir l'espace ». La route ne peut pas deviner : c'est
 * l'appelant qui demande (`?scope=own`), exactement comme sur le pipe et la
 * liste des missions.
 */
describe('portée financière — l’appelant DEMANDE, la route ne devine plus', () => {
  it('un RESPONSABLE qui demande `own` reçoit SON périmètre', async () => {
    const { controller, breakdown } = build({ role: 'owner' })
    await controller.revenueBreakdown(USER, '2026-07', 'own')
    expect(breakdown).toHaveBeenCalledWith({ kind: 'own', workspaceId: 'ws-1', userId: 'u-1' }, '2026-07', null)
  })

  it('le DÉFAUT reste l’espace — l’écran de pilotage ne change pas de réponse', async () => {
    // Les deux façons dont l'appelant d'avant se présente : rien du tout, et
    // « workspace » écrit noir sur blanc.
    for (const asked of [undefined, 'workspace']) {
      const { controller, breakdown } = build({ role: 'owner' })
      await controller.revenueBreakdown(USER, '2026-07', asked)
      expect(breakdown).toHaveBeenCalledWith({ kind: 'workspace', workspaceId: 'ws-1' }, '2026-07', null)
    }
  })

  it('une valeur ILLISIBLE rend l’espace, elle ne REFUSE pas', async () => {
    // Un lien collé de travers doit montrer quelque chose. Ce qui empêche le
    // mensonge n'est pas le refus : c'est que la réponse porte le périmètre
    // réellement servi, et l'écran qui reçoit `workspace` n'écrit pas « Mon ».
    const { controller, breakdown } = build({ role: 'owner' })
    const response = (await controller.revenueBreakdown(USER, '2026-07', 'everyone')) as { scope: unknown }
    expect(breakdown).toHaveBeenCalledWith({ kind: 'workspace', workspaceId: 'ws-1' }, '2026-07', null)
    // Et la réponse le DIT : l'écran qui a demandé « le mien » et lit
    // `kind: 'workspace'` sait qu'il ne doit pas écrire « Mon ».
    expect(response.scope).toEqual({ kind: 'workspace', outsideAnyPortfolio: null })
  })

  it('demander `workspace` n’OUVRE rien à qui n’a que `finance:read:own`', async () => {
    // La demande ne fait que RESSERRER. Le droit reste le plafond — sinon le
    // paramètre serait une élévation de privilège écrite dans l'URL.
    const { controller, breakdown } = build({ role: 'sales' })
    await controller.revenueBreakdown(USER, '2026-07', 'workspace')
    expect(breakdown).toHaveBeenCalledWith({ kind: 'own', workspaceId: 'ws-1', userId: 'u-1' }, '2026-07', null)
  })

  it('les QUATRE routes qui savent restreindre écoutent la demande', async () => {
    // Le paramètre DÉCLARÉ et jamais PASSÉ est une cause racine nommée de ce
    // dépôt : les quatre gestionnaires sont donc joués, pas seulement le premier.
    const { controller, breakdown, aggregate, marginAlerts, forecast, financeDigest } = build({ role: 'owner' })
    const own = { kind: 'own', workspaceId: 'ws-1', userId: 'u-1' }

    await controller.revenueBreakdown(USER, '2026-07', 'own')
    await controller.margin(USER, '2026-07', 'own')
    await controller.forecast(USER, '3', 'own')
    await controller.propagation(USER, 'own')

    expect(breakdown).toHaveBeenCalledWith(own, '2026-07', null)
    expect(aggregate).toHaveBeenCalledWith(own, '2026-07', null)
    // Les ALERTES suivent l'agrégat : une alerte tirée sur l'espace sous un
    // agrégat restreint enverrait renégocier le TJM d'une mission d'un collègue.
    expect(marginAlerts).toHaveBeenCalledWith(own, null)
    expect(forecast).toHaveBeenCalledWith(own, 3, null)
    // Le droit ne bouge PAS avec la portée : un `owner` qui regarde son coin
    // garde le droit de lire la marge d'équipe.
    expect(financeDigest).toHaveBeenCalledWith(own, true)
  })

  it('les TROIS routes d’espace n’écoutent RIEN — les refus écrits sont tenus', async () => {
    // `capacity` décrit l'ÉQUIPE, `margin-by-channel` compare les canaux de
    // l'ESPACE, `dso` est une médiane à plancher d'observations. Les trois refus
    // sont écrits dans le contrôleur depuis le 26/08 ; ce qui se vérifie ici,
    // c'est qu'ils n'ont pas été contournés en même temps que le reste.
    //
    // ⚠️ Un argument de trop passé à une méthode JavaScript est simplement
    // IGNORÉ : on peut donc jouer la demande fautive et regarder ce que le
    // service reçoit. Il reçoit `'ws-1'` — une CHAÎNE, pas une portée.
    const { controller, capacity, marginByChannel, dso } = build({ role: 'owner' })
    const asIfScoped = controller as unknown as {
      capacity: (u: unknown, m?: string, s?: string) => Promise<unknown>
      marginChannels: (u: unknown, m?: string, s?: string) => Promise<unknown>
      dso: (u: unknown, s?: string) => Promise<unknown>
    }
    await asIfScoped.capacity(USER, '2026-07', 'own')
    await asIfScoped.marginChannels(USER, '2026-07', 'own')
    await asIfScoped.dso(USER, 'own')

    expect(capacity).toHaveBeenCalledWith('ws-1', '2026-07')
    expect(marginByChannel).toHaveBeenCalledWith('ws-1', '2026-07', null)
    expect(dso).toHaveBeenCalledWith('ws-1')
  })
})

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Le paramètre SERT : le même jeu rend des chiffres DIFFÉRENTS               */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Un `RevenueService` RÉEL sur une base simulée qui APPLIQUE la restriction
 * qu'on lui passe : c'est la requête réellement construite qui est mise à
 * l'épreuve, pas une intention.
 *
 * Sans cette preuve, rien ne dit que `?scope=own` change quoi que ce soit —
 * « paramètre déclaré, jamais passé » est une cause racine nommée de ce dépôt,
 * et elle y a déjà frappé trois fois.
 */
describe('portée financière — les deux portées rendent des chiffres différents', () => {
  const ME = 'u-1'

  /** m1 : je la porte. m2 : le compte m'est attribué. m3 : ni l'un ni l'autre. */
  const MISSIONS = [
    { owner: ME, assignedTo: null, cents: 100_000 },
    { owner: null, assignedTo: ME, cents: 200_000 },
    { owner: null, assignedTo: null, cents: 900_000 },
  ]

  function controllerOverFakeDatabase(role: string) {
    const manager = {
      query: async (sql: string, params: unknown[]) => {
        if (sql.includes('COUNT(*)::text AS count')) return [{ count: '1' }]
        // La clause de périmètre est celle du contrat : `financeScopeClause`
        // l'écrit en `$3::uuid` sur les quatre lignes de chiffre d'affaires.
        const restricted = sql.includes('m.owner_id = $3::uuid')
        const me = params[2]
        const visible = MISSIONS.filter(row => !restricted || row.owner === me || row.assignedTo === me)
        const cents = visible.reduce((total, row) => total + row.cents, 0)
        return [{ cents: String(cents), source_rows: String(visible.length), without_amount: '0' }]
      },
    }
    const revenue = new RevenueService({ manager } as never)
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role }),
      extraPermissionsOf: jest.fn().mockResolvedValue([]),
    } as never
    const scores = { forecast: jest.fn(), capacity: jest.fn() } as never
    const propagation = { financeDigest: jest.fn() } as never
    const horizons = { compute: jest.fn() } as never
    return new FinanceController(revenue, scores, propagation, workspaceContext, horizons)
  }

  async function signedCents(controller: FinanceController, asked?: string): Promise<number | null> {
    const response = (await controller.revenueBreakdown(USER, '2026-07', asked)) as {
      lines: { kind: string; amountCents: number | null }[]
    }
    return response.lines.find(line => line.kind === 'signed')?.amountCents ?? null
  }

  it('sur le MÊME jeu, `own` et `workspace` ne rendent pas le même chiffre', async () => {
    const controller = controllerOverFakeDatabase('owner')

    const workspace = await signedCents(controller)
    const mine = await signedCents(controller, 'own')

    expect(workspace).toBe(1_200_000)
    expect(mine).toBe(300_000)
    // C'est TOUT le défaut : les deux rendaient le même chiffre.
    expect(mine).not.toBe(workspace)
  })

  it('« rien ne m’est rattaché » est un COMPTE, jamais un « 0 € »', async () => {
    // Un total restreint qui tombe à zéro se lit « je n'ai rien vendu ». Le
    // nombre de missions hors de tout périmètre est la phrase qui manque.
    const controller = controllerOverFakeDatabase('owner')

    const mine = (await controller.revenueBreakdown(USER, '2026-07', 'own')) as { scope: unknown }
    const space = (await controller.revenueBreakdown(USER, '2026-07')) as { scope: unknown }

    expect(mine.scope).toEqual({ kind: 'own', outsideAnyPortfolio: 1 })
    // `null` sur l'espace : il n'y a rien dehors, et « 0 hors périmètre »
    // affiché en permanence est un bruit qui cesse d'être lu.
    expect(space.scope).toEqual({ kind: 'workspace', outsideAnyPortfolio: null })
  })
})

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  « Mon périmètre » dit la MÊME chose sur les trois lignes du prévisionnel   */
/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Trouvé en ouvrant `mission-scores.service.ts` pour ce lot, et ANTÉRIEUR à lui :
 * la ligne ESPÉRÉE du prévisionnel portait sa PROPRE condition de périmètre,
 * écrite à la main —
 *
 *     scope.kind === 'workspace' ? … : { sql: ' AND a.assigned_to = $2::uuid' }
 *
 * — c'est-à-dire « mon périmètre = les comptes qui me sont attribués ». Or la
 * seule définition du dépôt en compte DEUX volets : « je le porte (`owner_id`)
 * OU le compte m'est attribué (`accounts.assigned_to`) ». Un projet que je porte
 * sur le compte d'un collègue sortait donc de MON prévisionnel, sans que rien ne
 * le dise.
 *
 * `opportunities.owner_id` existe pourtant, est indexé (`opportunities_owner_idx`,
 * migration `1789344812907`) et se saisit (`PATCH /projects/:id/owner`) : le
 * volet manquant n'était pas impossible, il était OUBLIÉ. Le défaut est
 * l'inverse de celui que ce lot corrige — une portée trop ÉTROITE — et il se
 * croit tout autant : un prévisionnel trop court ne se remarque pas non plus.
 */
describe('portée financière — les trois lignes du prévisionnel, une seule définition', () => {
  function scoresOverRecordingDatabase() {
    const queries: { sql: string; params: unknown[] }[] = []
    const manager = {
      query: async (sql: string, params: unknown[]) => {
        queries.push({ sql, params })
        return [{ cents: null, without_amount: '0', total: '0' }]
      },
    }
    return { service: new MissionScoresService({ manager } as never), queries }
  }

  const hopedOf = (queries: { sql: string; params: unknown[] }[]) =>
    queries.find(query => query.sql.includes('FROM opportunities o')) as { sql: string; params: unknown[] }

  it('la ligne ESPÉRÉE demande les DEUX rattachements, pas seulement le compte', async () => {
    const { service, queries } = scoresOverRecordingDatabase()

    await service.forecast({ kind: 'own', workspaceId: 'ws-1', userId: 'u-1' }, 3)

    const hoped = hopedOf(queries)
    // Les deux volets, et le paramètre passé UNE fois pour les deux.
    expect(hoped.sql).toContain('o.owner_id = $2::uuid')
    expect(hoped.sql).toContain('a.assigned_to = $2::uuid')
    expect(hoped.params).toEqual(['ws-1', 'u-1'])
  })

  it('l’alias du compte est `acc` — deux `a` imbriqués se lisent de travers', async () => {
    // La clause déclare son PROPRE `FROM accounts a` dans son sous-`EXISTS`.
    // PostgreSQL les résout correctement ; un relecteur, non.
    const { service, queries } = scoresOverRecordingDatabase()

    await service.forecast({ kind: 'own', workspaceId: 'ws-1', userId: 'u-1' }, 3)

    const hoped = hopedOf(queries)
    expect(hoped.sql).toContain('LEFT JOIN accounts acc ON acc.id = o.account_id')
    expect(hoped.sql).toContain('o.workspace_id = $1 OR acc.workspace_id = $1')
  })

  it('sur la portée « espace », AUCUNE condition de périmètre n’est ajoutée', async () => {
    // Chemin inchangé pour l'écran de pilotage : ni SQL en plus, ni paramètre.
    const { service, queries } = scoresOverRecordingDatabase()

    await service.forecast({ kind: 'workspace', workspaceId: 'ws-1' }, 3)

    const hoped = hopedOf(queries)
    expect(hoped.sql).not.toContain('owner_id')
    expect(hoped.sql).not.toContain('assigned_to')
    expect(hoped.params).toEqual(['ws-1'])
  })

  it('les TROIS lignes emploient la même clause — aucune n’a la sienne', async () => {
    const { service, queries } = scoresOverRecordingDatabase()

    await service.forecast({ kind: 'own', workspaceId: 'ws-1', userId: 'u-1' }, 3)

    // La garde LIT quelque chose : le prévisionnel tire bien trois requêtes.
    expect(queries).toHaveLength(3)
    for (const query of queries) {
      // Les deux volets partout — c'est ce qui manquait à la troisième.
      expect(query.sql).toMatch(/owner_id = \$\d::uuid/)
      expect(query.sql).toContain('a.assigned_to = $')
    }
  })
})
