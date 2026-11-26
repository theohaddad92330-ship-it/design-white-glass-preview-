import { describe, expect, it } from 'vitest'
import { libelleDiff, libelleVersion } from './prompt-registry-panel.logic'

describe('libelleVersion', () => {
  it('rend le hash quand il est posé', () => {
    expect(libelleVersion('abc123abc123')).toBe('abc123abc123')
  })

  it('une version `null` est un mot, jamais une cellule vide', () => {
    expect(libelleVersion(null)).toBe('non enregistré')
  })
})

// #2445.1 (épopée #2766) — le diff entre deux refs, tel qu'affiché sous le
// registre. Une chaîne vide dit deux refs IDENTIQUES sur ce prompt, jamais un
// diff introuvable qui se lirait comme une panne.
describe('libelleDiff', () => {
  it('rend le texte du diff tel quel quand il y en a un', () => {
    expect(libelleDiff('-old\n+new')).toBe('-old\n+new')
  })

  it('une chaîne vide est un mot, jamais une zone vide qui se lirait comme une panne', () => {
    expect(libelleDiff('')).toBe('Aucune différence entre ces deux références.')
  })
})
