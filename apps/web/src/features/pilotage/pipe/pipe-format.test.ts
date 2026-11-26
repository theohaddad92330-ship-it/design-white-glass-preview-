import type { PipeRiskSignal, PipeWaterfall } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { signalParams, waterfallBars } from './pipe-format'

const wf = (over: Partial<PipeWaterfall>): PipeWaterfall => ({
  from: '2026-10-01T00:00:00.000Z',
  to: '2026-10-14T12:00:00.000Z',
  openingCents: 600_000,
  createdCents: 130_000,
  raisedCents: 90_000,
  loweredCents: 50_000,
  lostCents: 200_000,
  signedCents: 250_000,
  removedCents: 0,
  closingCents: 320_000,
  unexplainedCents: 0,
  openingCount: 3,
  closingCount: 2,
  withoutAmountCount: 0,
  ...over,
})

describe('waterfallBars', () => {
  it("l'ordre est celui de l'équation : ouverture, entrées, relevés, baissés, perdues, signées, clôture", () => {
    expect(waterfallBars(wf({})).map(bar => bar.key)).toEqual([
      'opening',
      'created',
      'raised',
      'lowered',
      'lost',
      'signed',
      'closing',
    ])
  })

  it('une barre nulle ne fait aucune ligne ; ouverture et clôture restent toujours', () => {
    const keys = waterfallBars(
      wf({ createdCents: 0, raisedCents: 0, loweredCents: 0, lostCents: 0, signedCents: 0 }),
    ).map(bar => bar.key)
    expect(keys).toEqual(['opening', 'closing'])
  })

  it("l'écart non expliqué n'apparaît que s'il existe, nommé, avant la clôture", () => {
    const bars = waterfallBars(wf({ unexplainedCents: -10_000 }))
    const keys = bars.map(bar => bar.key)
    expect(keys.indexOf('unexplained')).toBe(keys.length - 2)
    expect(bars.find(bar => bar.key === 'unexplained')?.cents).toBe(-10_000)
  })

  it('les sorties sont signées : plus pour ce qui entre, moins pour ce qui sort', () => {
    const bars = waterfallBars(wf({ removedCents: 5_000 }))
    const kind = (key: string) => bars.find(bar => bar.key === key)?.kind
    expect(kind('created')).toBe('plus')
    expect(kind('lowered')).toBe('minus')
    expect(kind('lost')).toBe('minus')
    expect(kind('removed')).toBe('minus')
    expect(kind('opening')).toBe('total')
  })
})

describe('signalParams', () => {
  it('rend les chiffres du fait, jamais un score', () => {
    const signal: PipeRiskSignal = { kind: 'close_overdue', days: 12, count: null, fromCents: null, toCents: null }
    expect(signalParams(signal, cents => `${cents / 100} €`)).toEqual({
      days: 12,
      count: undefined,
      from: undefined,
      to: undefined,
    })
    const lowered: PipeRiskSignal = {
      kind: 'amount_lowered',
      days: null,
      count: null,
      fromCents: 200_000,
      toCents: 150_000,
    }
    expect(signalParams(lowered, cents => `${cents / 100} €`)).toMatchObject({ from: '2000 €', to: '1500 €' })
  })
})
