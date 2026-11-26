import { describe, expect, it } from 'vitest'
import { outreachAssetGate } from './outreach-asset.js'

describe('outreachAssetGate — #2372.6', () => {
  it('refuse un asset "after_interest_confirmed" tant qu’aucun intérêt n’est confirmé, avec une raison nommée', () => {
    const result = outreachAssetGate('after_interest_confirmed', false)
    expect(result).toEqual({ ok: false, reason: 'interest_not_confirmed' })
  })

  it('laisse passer un asset "after_interest_confirmed" une fois l’intérêt confirmé', () => {
    const result = outreachAssetGate('after_interest_confirmed', true)
    expect(result).toEqual({ ok: true })
  })

  it('laisse toujours passer un asset "always", intérêt confirmé ou non', () => {
    expect(outreachAssetGate('always', false)).toEqual({ ok: true })
    expect(outreachAssetGate('always', true)).toEqual({ ok: true })
  })
})
