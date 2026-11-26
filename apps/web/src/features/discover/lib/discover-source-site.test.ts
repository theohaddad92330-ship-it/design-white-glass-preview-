import { describe, expect, it } from 'vitest'
import { sourceSiteName } from './discover-source-site'

// Théo A decouvrir.R5 — SOURCES CLIQUABLES, VISIBLES DIRECTEMENT : le lien nomme le site d'ORIGINE.
describe('sourceSiteName', () => {
  it('rend l’hôte de l’éditeur, sans « www. » ni chemin', () => {
    expect(sourceSiteName('https://www.lemonde.fr/economie/article/2026/10/01/x.html')).toBe('lemonde.fr')
    expect(sourceSiteName('http://boamp.fr/avis/123?q=1')).toBe('boamp.fr')
  })
  it('SAIT DIRE NON : pas d’URL lisible, ou pas http(s) → rien d’inventé', () => {
    expect(sourceSiteName('')).toBeNull()
    expect(sourceSiteName('pas une url')).toBeNull()
    expect(sourceSiteName('javascript:alert(1)')).toBeNull()
    expect(sourceSiteName('mailto:a@b.fr')).toBeNull()
  })
})
