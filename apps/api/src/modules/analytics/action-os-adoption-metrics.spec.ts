import { computeActionOsAdoptionMetrics } from './action-os-adoption-metrics'

describe('computeActionOsAdoptionMetrics', () => {
  it('reports the raw counts unchanged', () => {
    const result = computeActionOsAdoptionMetrics({ validated: 3, executed: 2, disabled: 1, firstSuccessAt: null })
    expect(result.validated).toBe(3)
    expect(result.executed).toBe(2)
  })

  it('renders firstSuccessAt as an ISO string when a date is given', () => {
    const result = computeActionOsAdoptionMetrics({
      validated: 1,
      executed: 1,
      disabled: 0,
      firstSuccessAt: '2026-09-01T10:00:00.000Z',
    })
    expect(result.firstSuccessAt).toBe('2026-09-01T10:00:00.000Z')
  })

  it('normalizes a Date instance to the same ISO string', () => {
    const result = computeActionOsAdoptionMetrics({
      validated: 0,
      executed: 0,
      disabled: 0,
      firstSuccessAt: new Date('2026-09-01T10:00:00.000Z'),
    })
    expect(result.firstSuccessAt).toBe('2026-09-01T10:00:00.000Z')
  })

  it('never invents a first-success date — null stays null (GA-18/19)', () => {
    const result = computeActionOsAdoptionMetrics({ validated: 0, executed: 0, disabled: 0, firstSuccessAt: null })
    expect(result.firstSuccessAt).toBeNull()
  })

  it('zero validated/executed are real zeros, not omitted', () => {
    const result = computeActionOsAdoptionMetrics({ validated: 0, executed: 0, disabled: 0, firstSuccessAt: null })
    expect(result.validated).toBe(0)
    expect(result.executed).toBe(0)
  })

  // #2442.13 (épopée #2879) — le 4e mot du point : « désactivation ».
  it('reports the disabled count unchanged, zero included (GA-18/19)', () => {
    const some = computeActionOsAdoptionMetrics({ validated: 1, executed: 1, disabled: 3, firstSuccessAt: null })
    expect(some.disabled).toBe(3)
    const none = computeActionOsAdoptionMetrics({ validated: 0, executed: 0, disabled: 0, firstSuccessAt: null })
    expect(none.disabled).toBe(0)
  })
})
