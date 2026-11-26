import { describe, expect, it } from 'vitest'
import { communeCoordinates } from './geo-communes-coordinates.js'

const km = (a: readonly [number, number], b: readonly [number, number]) => {
  const rad = (d: number) => (d * Math.PI) / 180
  const h =
    Math.sin(rad(b[0] - a[0]) / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

describe('#5069 — référentiel des coordonnées des communes', () => {
  it('rend les voisines de Lille à leur vraie distance', () => {
    const lille = communeCoordinates('Lille')
    expect(lille).not.toBeNull()
    for (const town of ['Roubaix', 'Tourcoing', "Villeneuve-d'Ascq"]) {
      const point = communeCoordinates(town)
      expect(point, town).not.toBeNull()
      expect(km(lille!, point!)).toBeLessThan(15)
    }
    expect(km(lille!, communeCoordinates('Arras')!)).toBeGreaterThan(30)
  })

  it('normalise accents, tirets, casse et « St »', () => {
    expect(communeCoordinates('SAINT-ÉTIENNE')).toEqual(communeCoordinates('saint etienne'))
    expect(communeCoordinates('St-Étienne')).toEqual(communeCoordinates('Saint Etienne'))
    expect(communeCoordinates('Saint-Étienne')).not.toBeNull()
  })

  it('ne devine pas un homonyme : sans département, rien ; avec, la bonne commune', () => {
    expect(communeCoordinates('Saint-Denis')).toBeNull()
    const seineSaintDenis = communeCoordinates('Saint-Denis', '93')
    expect(seineSaintDenis?.[0]).toBeGreaterThan(48.9)
    expect(communeCoordinates('Saint-Denis', '59')).toBeNull()
  })

  it('un département qui ne correspond pas, ou une commune inconnue : null', () => {
    expect(communeCoordinates('Lille', '13')).toBeNull()
    expect(communeCoordinates('Saint-Trucmuche')).toBeNull()
    expect(communeCoordinates('')).toBeNull()
  })

  it('ramène un arrondissement à sa commune', () => {
    expect(communeCoordinates('Paris 8e')).toEqual(communeCoordinates('Paris'))
  })
})
