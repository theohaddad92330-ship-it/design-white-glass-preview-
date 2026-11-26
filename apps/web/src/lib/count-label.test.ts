import { describe, expect, it } from 'vitest'
import { labelWithCount } from './count-label'

// #4433.9 — « une absence ne fait aucune ligne et n'écrit jamais 0 » (GA-18 / GA-19).
describe('labelWithCount', () => {
  it('un compte positif se lit à côté du libellé, dans le style demandé', () => {
    expect(labelWithCount('Actives', 3, 'dot')).toBe('Actives · 3')
    expect(labelWithCount('En veille', 2, 'paren')).toBe('En veille (2)')
  })

  it('sait dire NON : zéro, vide ou inconnu ⇒ le libellé SEUL, jamais « 0 »', () => {
    for (const style of ['dot', 'paren'] as const) {
      expect(labelWithCount('Terminées', 0, style)).toBe('Terminées')
      expect(labelWithCount('Terminées', undefined, style)).toBe('Terminées')
      expect(labelWithCount('Terminées', Number.NaN, style)).toBe('Terminées')
    }
  })
})
