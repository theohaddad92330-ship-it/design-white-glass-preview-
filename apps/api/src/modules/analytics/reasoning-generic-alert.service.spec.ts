import { GENERIC_JUDGE_CALIBRATION } from '@bellum/contracts'
import { ObservabilityAlertsService } from './observability-alerts.service'

/**
 * #3223 (décision Louis 11/10/2026) — l'alerte « hausse des réponses génériques ».
 * Elle ne part QUE si le juge est fiable : la fiabilité est simulée ici, la
 * calibration livrée (non mesurée) est testée par le cas « muette ».
 */
let reliable = false
jest.mock('@bellum/contracts', () => {
  const actual = jest.requireActual('@bellum/contracts')
  return {
    ...actual,
    genericJudgeReliability: (...args: unknown[]) =>
      reliable
        ? {
            state: 'reliable',
            judgeVersion: actual.GENERIC_JUDGE_CALIBRATION.judgeVersion,
            agreementPercent: 90,
            agreed: 27,
            judged: 30,
            thresholdPercent: 85,
            measuredAt: '2026-10-11',
          }
        : actual.genericJudgeReliability(...args),
  }
})

const NOW = new Date('2026-10-11T08:00:00.000Z')

function build(judgements: Array<{ verdict: string; judge_version: string }>) {
  const query = jest.fn(async (sql: string) => (sql.includes('chat_generic_judgements') ? judgements : []))
  const service = new ObservabilityAlertsService({ query } as never)
  const error = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)
  jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined)
  return { service, error }
}

const fired = (error: jest.SpyInstance) =>
  error.mock.calls.filter(call => JSON.stringify(call[1]).includes('"alert.key":"reasoning_generic_rise"'))

const rows = (generic: number, specific: number) => [
  ...Array.from({ length: generic }, () => ({
    verdict: 'generique',
    judge_version: GENERIC_JUDGE_CALIBRATION.judgeVersion,
  })),
  ...Array.from({ length: specific }, () => ({
    verdict: 'specifique',
    judge_version: GENERIC_JUDGE_CALIBRATION.judgeVersion,
  })),
]

describe('alerte « hausse des réponses génériques » (#3223, juge évalué)', () => {
  afterEach(() => {
    reliable = false
  })

  it('juge fiable et part au-dessus du seuil : l’alerte part', async () => {
    reliable = true
    const { service, error } = build(rows(8, 8))
    await service.check(NOW)
    expect(fired(error)).toHaveLength(1)
  })

  it('juge fiable, part sous le seuil : muette', async () => {
    reliable = true
    const { service, error } = build(rows(2, 18))
    await service.check(NOW)
    expect(fired(error)).toHaveLength(0)
  })

  it('sait dire NON : juge non fiable (calibration livrée), muette même sur 100 % de génériques', async () => {
    const { service, error } = build(rows(40, 0))
    await service.check(NOW)
    expect(fired(error)).toHaveLength(0)
  })
})
