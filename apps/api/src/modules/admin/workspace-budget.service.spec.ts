import { Logger } from '@nestjs/common'
import { WorkspaceBudgetService } from './workspace-budget.service'

/**
 * Le service au-dessus de la porte pure `checkBudgetGate` (`@bellum/contracts`).
 *
 * Même discipline que `CostAlertService.spec` : le mock `find` FILTRE
 * vraiment sur `where`, pour prouver que le service ne lit QUE ce qui est
 * scopé à l'espace (GA-43) — jamais un total qui mélangerait deux espaces.
 */

type CostRow = {
  workspace_id: string | null
  user_id: string | null
  feature: string
  cost_usd: string | null
  created_at: Date
  // #2975 — le LEDGER en lecture ne lit que `feature`/`cost_usd`/`created_at`
  // pour la porte, mais `listLedger` lit aussi ces quatre-là. Facultatifs
  // ici : les tests de la porte, plus anciens, n'ont pas à les connaître.
  id?: string
  provider?: string
  operation?: string
  calls?: number
  units?: number
  status?: string | null
}

type BudgetRow = {
  workspace_id: string
  monthly_budget_usd: string | null
  per_member_cap_usd: string | null
  per_action_cap_usd: string | null
  alert_on_overage: boolean
  block_at_cap: boolean
}

function setup(costRows: CostRow[], budgetRows: BudgetRow[] = []) {
  const saved: unknown[] = []
  const costs = {
    // Filtre VRAIMENT sur `workspace_id` ET `created_at` (un `FindOperator`
    // `MoreThanOrEqual`, comme le service le passe) — un mock qui les ignore
    // prouverait que le service ENVOIE le bon filtre, jamais qu'il ne LIT que
    // ce que Postgres aurait filtré (même piège que le défaut n6 de
    // `CostAlertService`).
    find: jest.fn().mockImplementation((options: { where?: { workspace_id?: string; created_at?: unknown } } = {}) => {
      const wantedWorkspace = options.where?.workspace_id
      const sinceOperator = options.where?.created_at as { value?: Date } | undefined
      const since = sinceOperator?.value
      return Promise.resolve(
        costRows.filter(
          row =>
            (wantedWorkspace == null || row.workspace_id === wantedWorkspace) &&
            (since == null || row.created_at >= since),
        ),
      )
    }),
  }
  const budgets = {
    findOne: jest.fn().mockImplementation((options: { where?: { workspace_id?: string } } = {}) => {
      const wanted = options.where?.workspace_id
      return Promise.resolve(budgetRows.find(row => row.workspace_id === wanted) ?? null)
    }),
    upsert: jest.fn().mockImplementation((row: BudgetRow) => {
      saved.push(row)
      return Promise.resolve()
    }),
  }
  const service = new WorkspaceBudgetService(costs as never, budgets as never)
  return { service, saved, costs }
}

const NOW = new Date('2026-09-25T10:00:00.000Z')
const IN_MONTH = new Date('2026-09-10T00:00:00.000Z')
const LAST_MONTH = new Date('2026-08-30T23:59:59.000Z')

describe('sans ligne réglée, la porte est un no-op — comme COST_ALERT_DAILY_USD absent', () => {
  it('laisse toujours passer un espace sans workspace_budgets', async () => {
    const { service } = setup([
      { workspace_id: 'w1', user_id: 'u1', feature: 'chat', cost_usd: '999', created_at: IN_MONTH },
    ])
    const verdict = await service.checkGate('w1', 'u1', 'chat', 10, NOW)
    expect(verdict).toEqual({ allowed: true, overCap: null })
  })
})

describe('le gate lit le mois en cours, scopé à UN espace (GA-43)', () => {
  it('ignore les lignes du mois précédent', async () => {
    const { service } = setup(
      [{ workspace_id: 'w1', user_id: 'u1', feature: 'chat', cost_usd: '95', created_at: LAST_MONTH }],
      [
        {
          workspace_id: 'w1',
          monthly_budget_usd: '100',
          per_member_cap_usd: null,
          per_action_cap_usd: null,
          alert_on_overage: true,
          block_at_cap: true,
        },
      ],
    )
    const verdict = await service.checkGate('w1', 'u1', 'chat', 10, NOW)
    expect(verdict).toEqual({ allowed: true, overCap: null })
  })

  it("ignore les lignes d'un AUTRE espace — jamais agrégées ensemble", async () => {
    const { service } = setup(
      [{ workspace_id: 'w2', user_id: 'u1', feature: 'chat', cost_usd: '999', created_at: IN_MONTH }],
      [
        {
          workspace_id: 'w1',
          monthly_budget_usd: '100',
          per_member_cap_usd: null,
          per_action_cap_usd: null,
          alert_on_overage: true,
          block_at_cap: true,
        },
      ],
    )
    const verdict = await service.checkGate('w1', 'u1', 'chat', 10, NOW)
    expect(verdict).toEqual({ allowed: true, overCap: null })
  })

  it('bloque et nomme `workspace_budget` quand le mois en cours dépasse', async () => {
    const { service } = setup(
      [{ workspace_id: 'w1', user_id: 'u1', feature: 'chat', cost_usd: '95', created_at: IN_MONTH }],
      [
        {
          workspace_id: 'w1',
          monthly_budget_usd: '100',
          per_member_cap_usd: null,
          per_action_cap_usd: null,
          alert_on_overage: true,
          block_at_cap: true,
        },
      ],
    )
    const verdict = await service.checkGate('w1', 'u1', 'chat', 10, NOW)
    expect(verdict).toEqual({ allowed: false, overCap: 'workspace_budget', message: expect.any(String) })
  })

  it('une ligne non tarifée (cost_usd NULL) ne compte ni pour zéro ni contre le plafond', async () => {
    const { service } = setup(
      [{ workspace_id: 'w1', user_id: 'u1', feature: 'chat', cost_usd: null, created_at: IN_MONTH }],
      [
        {
          workspace_id: 'w1',
          monthly_budget_usd: '1',
          per_member_cap_usd: null,
          per_action_cap_usd: null,
          alert_on_overage: true,
          block_at_cap: true,
        },
      ],
    )
    const verdict = await service.checkGate('w1', 'u1', 'chat', 0.5, NOW)
    expect(verdict).toEqual({ allowed: true, overCap: null })
  })
})

describe('#2440.86 — l’alerte de dépassement (alertOnOverage), sans bloquer', () => {
  afterEach(() => jest.restoreAllMocks())

  it('journalise (Sentry) un dépassement quand blockAtCap est faux et alertOnOverage vrai', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const { service } = setup(
      [{ workspace_id: 'w1', user_id: 'u1', feature: 'chat', cost_usd: '95', created_at: IN_MONTH }],
      [
        {
          workspace_id: 'w1',
          monthly_budget_usd: '100',
          per_member_cap_usd: null,
          per_action_cap_usd: null,
          alert_on_overage: true,
          block_at_cap: false,
        },
      ],
    )

    const verdict = await service.checkGate('w1', 'u1', 'chat', 10, NOW)

    expect(verdict).toEqual({ allowed: true, overCap: 'workspace_budget', alert: true })
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]?.[0]).toContain('workspace_budget')
  })

  it("ne journalise RIEN quand alertOnOverage est faux — l'espace n'a rien demandé", async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const { service } = setup(
      [{ workspace_id: 'w1', user_id: 'u1', feature: 'chat', cost_usd: '95', created_at: IN_MONTH }],
      [
        {
          workspace_id: 'w1',
          monthly_budget_usd: '100',
          per_member_cap_usd: null,
          per_action_cap_usd: null,
          alert_on_overage: false,
          block_at_cap: false,
        },
      ],
    )

    await service.checkGate('w1', 'u1', 'chat', 10, NOW)

    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('ne journalise RIEN sous le plafond — pas de dépassement, pas d’alerte', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const { service } = setup(
      [{ workspace_id: 'w1', user_id: 'u1', feature: 'chat', cost_usd: '5', created_at: IN_MONTH }],
      [
        {
          workspace_id: 'w1',
          monthly_budget_usd: '100',
          per_member_cap_usd: null,
          per_action_cap_usd: null,
          alert_on_overage: true,
          block_at_cap: false,
        },
      ],
    )

    await service.checkGate('w1', 'u1', 'chat', 10, NOW)

    expect(warnSpy).not.toHaveBeenCalled()
  })
})

describe('les leviers admin — lecture/écriture, une ligne par espace', () => {
  it('rend les trois plafonds à `null` quand rien n’a jamais été réglé', async () => {
    const { service } = setup([])
    const levers = await service.getLevers('w1')
    expect(levers).toEqual({
      monthlyBudgetUsd: null,
      perMemberCapUsd: null,
      perActionCapUsd: null,
      alertOnOverage: true,
      blockAtCap: false,
    })
  })

  it('écrit les cinq leviers par UPSERT, une ligne par espace', async () => {
    const { service, saved } = setup([])
    await service.setLevers('w1', {
      monthlyBudgetUsd: 500,
      perMemberCapUsd: 50,
      perActionCapUsd: 5,
      alertOnOverage: true,
      blockAtCap: true,
    })
    expect(saved).toEqual([
      {
        workspace_id: 'w1',
        // `numeric` se parle en `string` via le driver pg — même discipline
        // que `cost_usd` sur `ProviderCostEntity`.
        monthly_budget_usd: '500',
        per_member_cap_usd: '50',
        per_action_cap_usd: '5',
        alert_on_overage: true,
        block_at_cap: true,
      },
    ])
  })
})

/**
 * #2975 — LE LEDGER en lecture. Distinct de `checkGate` : celui-là SOMME,
 * celui-ci LISTE — même donnée (`provider_costs`), deux questions.
 */
describe('listLedger — une ligne par appel modèle, scopée à UN espace (GA-43)', () => {
  it('rend chaque ligne du mois en cours, mappée telle qu’écrite — jamais un total', async () => {
    const { service } = setup([
      {
        workspace_id: 'w1',
        user_id: 'u1',
        feature: 'chat',
        cost_usd: '0.42',
        created_at: IN_MONTH,
        id: 'row-1',
        provider: 'anthropic',
        operation: 'complete',
        calls: 1,
        units: 820,
      },
    ])
    const result = await service.listLedger('w1', NOW)
    expect(result).toEqual([
      {
        id: 'row-1',
        feature: 'chat',
        provider: 'anthropic',
        operation: 'complete',
        calls: 1,
        units: 820,
        costUsd: 0.42,
        status: null,
        createdAt: IN_MONTH.toISOString(),
      },
    ])
  })

  // #2440.46 — une limite fournisseur (429 / surcharge) est une ligne du ledger, datée, sans coût
  // facturé : la fiche ESN la lit avec son statut, sans que le statut soit deviné quand il manque.
  it('porte le statut `provider_limit` de la ligne, et `null` quand la ligne n’en a pas', async () => {
    const { service } = setup([
      {
        workspace_id: 'w1',
        user_id: 'u1',
        feature: 'chat',
        cost_usd: '0',
        created_at: IN_MONTH,
        id: 'row-limit',
        provider: 'openai',
        operation: 'chat.limite',
        calls: 1,
        units: 0,
        status: 'provider_limit',
      },
      {
        workspace_id: 'w1',
        user_id: 'u1',
        feature: 'chat',
        cost_usd: '0.1',
        created_at: IN_MONTH,
        id: 'row-old',
        provider: 'anthropic',
        operation: 'complete',
        calls: 1,
        units: 5,
      },
    ])
    const result = await service.listLedger('w1', NOW)
    expect(result.map(r => [r.id, r.status])).toEqual([
      ['row-limit', 'provider_limit'],
      ['row-old', null],
    ])
  })

  it('ignore les lignes d’un AUTRE espace — jamais un total entre concurrents', async () => {
    const { service } = setup([
      {
        workspace_id: 'w2',
        user_id: 'u1',
        feature: 'chat',
        cost_usd: '0.42',
        created_at: IN_MONTH,
        id: 'row-1',
        provider: 'anthropic',
        operation: 'complete',
        calls: 1,
        units: 820,
      },
    ])
    const result = await service.listLedger('w1', NOW)
    expect(result).toEqual([])
  })

  it('ignore les lignes du mois PRÉCÉDENT', async () => {
    const { service } = setup([
      {
        workspace_id: 'w1',
        user_id: 'u1',
        feature: 'chat',
        cost_usd: '0.42',
        created_at: LAST_MONTH,
        id: 'row-1',
        provider: 'anthropic',
        operation: 'complete',
        calls: 1,
        units: 820,
      },
    ])
    const result = await service.listLedger('w1', NOW)
    expect(result).toEqual([])
  })

  it('garde `costUsd` à `null` sur une ligne NON TARIFÉE — jamais un coût inventé', async () => {
    const { service } = setup([
      {
        workspace_id: 'w1',
        user_id: 'u1',
        feature: 'enrichment',
        cost_usd: null,
        created_at: IN_MONTH,
        id: 'row-2',
        provider: 'apollo',
        operation: 'lookup',
        calls: 3,
        units: 3,
      },
    ])
    const result = await service.listLedger('w1', NOW)
    expect(result[0]?.costUsd).toBeNull()
    expect(result[0]?.units).toBe(3)
  })

  it('demande le tri le plus RÉCENT d’abord, et une page bornée — jamais toute la table', async () => {
    const { service, costs } = setup([])
    await service.listLedger('w1', NOW)
    expect(costs.find).toHaveBeenCalledWith(expect.objectContaining({ order: { created_at: 'DESC' }, take: 200 }))
  })
})

describe('#2440.45 — le quota quotidien PAR OUTIL (`AI_TOOL_DAILY_CAP_USD`, sans clé = no-op)', () => {
  const TODAY = new Date('2026-09-25T08:00:00.000Z')
  const YESTERDAY = new Date('2026-09-24T23:00:00.000Z')
  let previous: string | undefined

  beforeEach(() => {
    previous = process.env['AI_TOOL_DAILY_CAP_USD']
    delete process.env['AI_TOOL_DAILY_CAP_USD']
  })
  afterEach(() => {
    if (previous === undefined) delete process.env['AI_TOOL_DAILY_CAP_USD']
    else process.env['AI_TOOL_DAILY_CAP_USD'] = previous
  })

  it('sans la variable, ne lit RIEN — aucun appel à provider_costs', async () => {
    const { service, costs } = setup([
      { workspace_id: 'w1', user_id: 'u1', feature: 'analysis', cost_usd: '999', created_at: TODAY },
    ])
    expect(await service.checkGate('w1', 'u1', 'analysis', 1, NOW)).toEqual({ allowed: true, overCap: null })
    expect(costs.find).not.toHaveBeenCalled()
  })

  it('refuse au-delà du quota du jour et NOMME `tool_daily_cap`, même sans aucun levier admin', async () => {
    process.env['AI_TOOL_DAILY_CAP_USD'] = 'analysis=5'
    const { service } = setup([
      { workspace_id: 'w1', user_id: 'u2', feature: 'analysis', cost_usd: '4.5', created_at: TODAY },
    ])
    expect(await service.checkGate('w1', 'u1', 'analysis', 1, NOW)).toEqual({
      allowed: false,
      overCap: 'tool_daily_cap',
      message: expect.stringContaining('quotidien'),
    })
  })

  it('ne compte que la journée UTC en cours — la veille ne pèse pas', async () => {
    process.env['AI_TOOL_DAILY_CAP_USD'] = 'analysis=5'
    const { service } = setup([
      { workspace_id: 'w1', user_id: 'u1', feature: 'analysis', cost_usd: '40', created_at: YESTERDAY },
    ])
    expect(await service.checkGate('w1', 'u1', 'analysis', 1, NOW)).toEqual({ allowed: true, overCap: null })
  })

  it('GA-43 — la dépense d’un AUTRE espace ne pèse jamais', async () => {
    process.env['AI_TOOL_DAILY_CAP_USD'] = 'analysis=5'
    const { service } = setup([
      { workspace_id: 'w2', user_id: 'u9', feature: 'analysis', cost_usd: '40', created_at: TODAY },
    ])
    expect(await service.checkGate('w1', 'u1', 'analysis', 1, NOW)).toEqual({ allowed: true, overCap: null })
  })

  it('le budget de l’espace, plus englobant, est nommé AVANT le quota de l’outil', async () => {
    process.env['AI_TOOL_DAILY_CAP_USD'] = 'analysis=5'
    const { service } = setup(
      [{ workspace_id: 'w1', user_id: 'u1', feature: 'analysis', cost_usd: '9', created_at: TODAY }],
      [
        {
          workspace_id: 'w1',
          monthly_budget_usd: '8',
          per_member_cap_usd: null,
          per_action_cap_usd: null,
          alert_on_overage: true,
          block_at_cap: true,
        },
      ],
    )
    const verdict = await service.checkGate('w1', 'u1', 'analysis', 1, NOW)
    expect(verdict).toMatchObject({ allowed: false, overCap: 'workspace_budget' })
  })

  it('getToolQuotas — la MESURE back-office : une ligne par outil réglé, scopée à UN espace', async () => {
    process.env['AI_TOOL_DAILY_CAP_USD'] = 'analysis=5,enrichment=1'
    const { service } = setup([
      { workspace_id: 'w1', user_id: 'u1', feature: 'analysis', cost_usd: '2', created_at: TODAY },
      { workspace_id: 'w1', user_id: 'u1', feature: 'analysis', cost_usd: null, created_at: TODAY },
      { workspace_id: 'w1', user_id: 'u1', feature: 'analysis', cost_usd: '30', created_at: YESTERDAY },
      { workspace_id: 'w2', user_id: 'u9', feature: 'enrichment', cost_usd: '30', created_at: TODAY },
    ])
    expect(await service.getToolQuotas('w1', NOW)).toEqual([
      { tool: 'analysis', capUsd: 5, spentTodayUsd: 2, unpricedLines: 1, reached: false },
      { tool: 'enrichment', capUsd: 1, spentTodayUsd: 0, unpricedLines: 0, reached: false },
    ])
  })

  it('getToolQuotas — sans la variable, aucune ligne et aucune lecture', async () => {
    const { service, costs } = setup([])
    expect(await service.getToolQuotas('w1', NOW)).toEqual([])
    expect(costs.find).not.toHaveBeenCalled()
  })
})
