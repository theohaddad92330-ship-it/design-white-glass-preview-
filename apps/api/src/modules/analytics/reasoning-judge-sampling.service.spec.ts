import {
  REASONING_JUDGE_DAILY_SAMPLE_ENV,
  ReasoningJudgeSamplingService,
  readDailySample,
} from './reasoning-judge-sampling.service'

const NOW = new Date('2026-10-11T03:07:00.000Z')

function build(
  sampled: Array<{ id: string; content: string }>,
  judge: jest.Mock = jest.fn(async (answers: Array<{ id: string }>) => ({
    status: 'judged',
    judgeVersion: 'j1',
    verdicts: answers.map((a, i) => ({ id: a.id, verdict: i % 2 === 0 ? 'generique' : null })),
  })),
) {
  const query = jest.fn(async (sql: string) => (sql.includes('ORDER BY random()') ? sampled : []))
  const service = new ReasoningJudgeSamplingService({ query } as never, { judgeGenericRecommendations: judge } as never)
  jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined)
  return { service, query, judge }
}

const answers = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, content: `réponse ${i}` }))

describe('ReasoningJudgeSamplingService (#3223, décision Louis 11/10)', () => {
  const saved = process.env[REASONING_JUDGE_DAILY_SAMPLE_ENV]
  afterEach(() => {
    if (saved === undefined) delete process.env[REASONING_JUDGE_DAILY_SAMPLE_ENV]
    else process.env[REASONING_JUDGE_DAILY_SAMPLE_ENV] = saved
  })

  it('réglage absent : NO-OP STRICT — aucune lecture, aucun appel', async () => {
    delete process.env[REASONING_JUDGE_DAILY_SAMPLE_ENV]
    const { service, query, judge } = build(answers(5))
    expect(await service.sample(NOW)).toBe(0)
    expect(query).not.toHaveBeenCalled()
    expect(judge).not.toHaveBeenCalled()
  })

  it('tire au plus N réponses réelles non encore jugées, et n’écrit que des jetons', async () => {
    process.env[REASONING_JUDGE_DAILY_SAMPLE_ENV] = '30'
    const { service, query } = build(answers(4))
    expect(await service.sample(NOW)).toBe(2)
    const [selectSql, selectParams] = query.mock.calls[0] as unknown as [string, unknown[]]
    expect(selectSql).toContain('w.is_demo = false')
    expect(selectSql).toContain('j.message_id IS NULL')
    expect(selectParams[1]).toBe(30)
    const inserts = query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO chat_generic_judgements'))
    // Le verdict `null` (non jugé) n'est jamais écrit.
    expect(inserts.map(call => (call as unknown[])[1])).toEqual([
      ['m0', 'generique', 'j1'],
      ['m2', 'generique', 'j1'],
    ])
    expect(JSON.stringify(inserts)).not.toContain('réponse')
  })

  it('n’envoie que la réponse de Laura, par lots de 50 au plus', async () => {
    process.env[REASONING_JUDGE_DAILY_SAMPLE_ENV] = '120'
    const { service, judge } = build(answers(120))
    await service.sample(NOW)
    expect(judge.mock.calls.map(([batch]) => (batch as unknown[]).length)).toEqual([50, 50, 20])
    expect(Object.keys((judge.mock.calls[0]?.[0] as object[])[0] ?? {})).toEqual(['id', 'text'])
  })

  it('échantillonnage production éteint côté IA : rien n’est écrit', async () => {
    process.env[REASONING_JUDGE_DAILY_SAMPLE_ENV] = '10'
    const { service, query } = build(
      answers(3),
      jest.fn(async () => ({ status: 'disabled' })),
    )
    expect(await service.sample(NOW)).toBe(0)
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT'))).toBe(false)
  })

  it('le réglage est borné : illisible ou négatif = 0, aberrant = plafond', () => {
    expect(readDailySample(undefined)).toBe(0)
    expect(readDailySample('abc')).toBe(0)
    expect(readDailySample('-4')).toBe(0)
    expect(readDailySample('25')).toBe(25)
    expect(readDailySample('100000')).toBe(200)
  })
})
