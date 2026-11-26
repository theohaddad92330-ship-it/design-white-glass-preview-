import { describe, expect, it } from 'vitest'
import { hasRestrictedSource } from './restricted-source'

describe('hasRestrictedSource — #3775.2b', () => {
  it('rend `true` dès qu’une réponse cite une source marquée `restricted`', () => {
    expect(
      hasRestrictedSource([
        { context: { sources: [{ restricted: true }] } },
        { context: { sources: [{ restricted: false }] } },
      ]),
    ).toBe(true)
  })

  it('rend `false` quand aucune source n’est restreinte', () => {
    expect(hasRestrictedSource([{ context: { sources: [{ restricted: false }] } }])).toBe(false)
  })

  it('n’attrape pas ce qu’elle ne vise pas : un fil sans contexte, sans sources, ou vide', () => {
    expect(hasRestrictedSource([])).toBe(false)
    expect(hasRestrictedSource([{ context: null }])).toBe(false)
    expect(hasRestrictedSource([{}])).toBe(false)
    expect(hasRestrictedSource([{ context: { sources: [] } }])).toBe(false)
  })

  it('sait dire NON : une seule source saine parmi plusieurs restreintes ne suffit pas à l’effacer', () => {
    expect(hasRestrictedSource([{ context: { sources: [{ restricted: false }, { restricted: true }] } }])).toBe(true)
  })
})
