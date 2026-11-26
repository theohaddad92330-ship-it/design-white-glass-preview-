import { describe, expect, it } from 'vitest'
import { stripRegistryJargon, stripRegistryJargonDeep } from './strip-registry-jargon'

describe('stripRegistryJargon', () => {
  it.each([
    ['NAF 92.3B, SIREN 341902898', ''],
    ['NAF 64.19Z', ''],
    ['Banque (NAF 70.22Z) à Paris', 'Banque à Paris'],
    ['NAF 64.19 Z · SIRET 34190289800012', ''],
    ['Cartier · NAF 92.3B, SIREN 341902898', 'Cartier'],
    ['SIREN 341 902 898, luxe', 'luxe'],
    ['NAF 90.01Z (arts du spectacle)', 'arts du spectacle'],
    ['Acteur culturel, NAF 90.01Z (arts du spectacle), Paris', 'Acteur culturel, arts du spectacle, Paris'],
    ['Joaillerie 32.12Z · Paris', 'Joaillerie · Paris'],
  ])('%j → %j', (input, expected) => {
    expect(stripRegistryJargon(input)).toBe(expected)
  })

  it('rend à l’identique un texte sans jargon', () => {
    const text = 'Groupe de luxe, 12.5 M€ de CA, 3 filiales · Paris.'
    expect(stripRegistryJargon(text)).toBe(text)
    expect(stripRegistryJargon('')).toBe('')
  })

  it('#4994 — « NAF 90.01Z, arts du spectacle » garde le libellé après la virgule', () => {
    expect(stripRegistryJargon('NAF 90.01Z, arts du spectacle')).toBe('arts du spectacle')
    expect(stripRegistryJargon('NAF 92.3B, SIREN 341902898')).toBe('')
  })

  it('#4994 — la version profonde nettoie chaque chaîne d’une donnée imbriquée, sans toucher au reste', () => {
    const data = { a: ['NAF 92.3B, SIREN 341902898', 'Cartier'], b: { c: 'NAF 90.01Z, arts du spectacle', n: 3 } }
    expect(stripRegistryJargonDeep(data)).toEqual({ a: ['', 'Cartier'], b: { c: 'arts du spectacle', n: 3 } })
    const clean = { a: ['x'] }
    expect(stripRegistryJargonDeep(clean)).toBe(clean)
    expect(stripRegistryJargonDeep(null)).toBeNull()
  })
})
