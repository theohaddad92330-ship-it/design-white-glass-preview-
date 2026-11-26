import { describe, expect, it } from 'vitest'
import { resolveQualifyTarget } from './discover-qualify'

// #4284.24 (#4279.1) — « Qualifier » sur une ligne dont le SIREN n'est plus dans la liste affichée ne faisait RIEN :
// ni navigation, ni message. Le geste doit soit partir, soit dire pourquoi il ne part pas.
describe('resolveQualifyTarget', () => {
  const known = new Map([['123456789', { siren: '123456789', name: 'ACME' }]])

  it('rend le candidat connu', () => {
    expect(resolveQualifyTarget(known, '123456789')).toEqual({
      kind: 'analyze',
      candidate: { siren: '123456789', name: 'ACME' },
    })
  })

  it('dit « absent » pour un SIREN qui n’est plus dans la liste — jamais un geste muet', () => {
    expect(resolveQualifyTarget(known, '987654321')).toEqual({ kind: 'missing' })
  })

  it('un SIREN vide est absent aussi', () => {
    expect(resolveQualifyTarget(known, '')).toEqual({ kind: 'missing' })
  })
})
