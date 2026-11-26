import { InternalReasoningQualityController } from './internal-reasoning-quality.controller'
import { ReasoningQualityService } from './reasoning-quality.service'

type Row = { context: unknown }

function serviceWith(rows: Row[] | Error) {
  const query = jest.fn(async () => {
    if (rows instanceof Error) throw rows
    return rows
  })
  const service = new ReasoningQualityService({ query } as never)
  return { service, query }
}

const ACTIVE = {
  profile: { present: true, name: null },
  account: { present: false, name: null },
  contacts_count: 0,
  plan: { present: false },
  portfolio: { present: false, count: 0 },
  memory: { pinned_facts: 0, has_summary: false },
}

describe('ReasoningQualityService (#3223.3)', () => {
  it('lit les contextes persistés et rend un rapport sans identifiant', async () => {
    const rows = Array.from({ length: 12 }, () => ({
      context: {
        active: ACTIVE,
        sources: [],
        not_consulted: [],
        turn_observability: {
          execution_plan: 'x',
          planned_steps: 1,
          completed_steps: 1,
          skipped_steps: 0,
          parallel_calls: 0,
          budget_exhausted: true,
          degraded_answer: false,
          job_created: false,
        },
        reasoning_trace: {
          detected_intent: 'i',
          tools_planned: ['a'],
          tools_called: [],
          verifier_status: 'pass',
        },
      },
    }))
    const { service, query } = serviceWith(rows)
    const report = await service.report(30)
    expect(report.turns).toBe(12)
    expect(report.metrics.budgetInterruptedRate).toMatchObject({ state: 'measured', value: 100, sample: 12 })
    expect(report.metrics.ignoredToolsRate).toMatchObject({ state: 'measured', value: 100 })
    // Le SQL ne ramène que la colonne `context`, des espaces non démo.
    const sql = (query.mock.calls[0] as unknown as [string])[0]
    expect(sql).toMatch(/is_demo = false/)
    const selected = sql.split('FROM')[0] ?? ''
    expect(selected).toMatch(/m\.context/)
    expect(selected).not.toMatch(/workspace_id|user_id|content/)
  })

  it('une lecture impossible rend « non mesuré », jamais un taux rassurant', async () => {
    const { service } = serviceWith(new Error('db down'))
    const report = await service.report(30)
    expect(report.turns).toBe(0)
    expect(report.metrics.budgetInterruptedRate.state).toBe('unmeasured')
  })

  it('plafonne la fenêtre à 90 jours et ignore une valeur absurde', async () => {
    const { service } = serviceWith([])
    expect((await service.report(5000)).windowDays).toBe(90)
    expect((await service.report(-3)).windowDays).toBe(30)
    expect((await service.report(Number.NaN)).windowDays).toBe(30)
  })

  it('le contrôleur relaie le paramètre `days`', async () => {
    const { service } = serviceWith([])
    const controller = new InternalReasoningQualityController(service)
    expect((await controller.get('7')).windowDays).toBe(7)
    expect((await controller.get(undefined)).windowDays).toBe(30)
  })
})
