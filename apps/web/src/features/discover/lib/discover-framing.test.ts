import { describe, expect, it } from 'vitest'
import { emptyUnifiedFilters, type UnifiedFilters } from './discover-filters'
import { FRAMING_FIELDS, FRAMING_OUTSIDE_FIELDS, FRAMING_SECTIONS, framingLoadedCount } from './discover-framing'

const row = (siren: string) => ({ siren })

describe('#4494.4 — la preuve comptée : chaque filtre d’avant a SA rubrique', () => {
  const placed = Object.values(FRAMING_FIELDS).flat()

  it('chaque clé de `UnifiedFilters` est portée par une rubrique, ou nommée hors modale avec sa raison', () => {
    const keys = Object.keys(emptyUnifiedFilters()) as (keyof UnifiedFilters)[]
    const missing = keys.filter(key => !placed.includes(key) && !FRAMING_OUTSIDE_FIELDS.includes(key))
    expect(missing).toEqual([])
  })

  it('aucun filtre n’est rangé deux fois (un réglage à un seul endroit, GA-26)', () => {
    expect(new Set(placed).size).toBe(placed.length)
  })

  it('les cinq rubriques de la maquette d’abord, dans son ordre, puis celle ajoutée', () => {
    expect(FRAMING_SECTIONS).toEqual(['companies', 'territory', 'expertise', 'signals', 'relation', 'size'])
  })

  it('sait dire NON — une clé oubliée se voit', () => {
    const keys = [...Object.keys(emptyUnifiedFilters()), 'nouveauFiltre'] as (keyof UnifiedFilters)[]
    expect(keys.filter(key => !placed.includes(key) && !FRAMING_OUTSIDE_FIELDS.includes(key))).toEqual([
      'nouveauFiltre',
    ])
  })
})

describe('#4494.3 — « N comptes » sur les comptes déjà chargés', () => {
  it('brouillon = recherche affichée ⇒ exactement ce que l’écran affiche', () => {
    const kept = [row('a'), row('b'), row('c')]
    expect(framingLoadedCount(kept, kept, [row('a'), row('b')])).toBe(2)
  })

  it('un compte retiré par le brouillon ne compte plus ; un compte que seul le brouillon fait entrer compte', () => {
    const active = [row('a'), row('b')]
    const draft = [row('b'), row('c')]
    expect(framingLoadedCount(draft, active, active)).toBe(2)
  })

  it('un compte masqué par la barre de résultats reste masqué', () => {
    expect(framingLoadedCount([row('a'), row('b')], [row('a'), row('b')], [row('a')])).toBe(1)
  })
})
