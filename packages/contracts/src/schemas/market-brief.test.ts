import { describe, expect, it } from 'vitest'
import lille from '../market-brief/lille.fixture.json' with { type: 'json' }
import { marketBriefSchema } from './market-brief.js'

const clone = (): Record<string, unknown> => structuredClone(lille) as Record<string, unknown>
const withZone = (zone: Record<string, unknown>): Record<string, unknown> => ({
  ...clone(),
  zone: { ...(lille.zone as Record<string, unknown>), ...zone },
})

describe('marketBriefSchema — le brief du marché de Lille', () => {
  it('un brief valide et complet passe', () => {
    expect(marketBriefSchema.safeParse(clone()).success).toBe(true)
  })

  it('un brief minimal (sans grille, tendance, clients…) passe aussi', () => {
    const minimal = clone()
    for (const key of ['price_grid', 'price_trend', 'clients', 'groups', 'calendar', 'rules']) delete minimal[key]
    expect(marketBriefSchema.safeParse(minimal).success).toBe(true)
  })

  it('est FERMÉ : une clé inconnue est refusée', () => {
    expect(marketBriefSchema.safeParse({ ...clone(), colonne_brute: 'x' }).success).toBe(false)
  })

  it('refuse plus de 6 KPI', () => {
    const kpis = Array.from({ length: 7 }, (_, i) => ({ label: `K${i}`, value: i }))
    expect(marketBriefSchema.safeParse({ ...clone(), kpis }).success).toBe(false)
  })

  it('exige au moins une rubrique « ce que je sais » et un garde-fou', () => {
    expect(marketBriefSchema.safeParse({ ...clone(), what_i_know: [] }).success).toBe(false)
    expect(marketBriefSchema.safeParse({ ...clone(), guardrails: [] }).success).toBe(false)
  })

  it('garde les personnes EN CLAIR, avec leur employeur (D5)', () => {
    const parsed = marketBriefSchema.parse(clone())
    expect(parsed.people[0]).toMatchObject({ name: 'Camille Durand', entity: 'Exemple Retail Lille' })
    expect(parsed.people[0]?.email).toContain('@')
  })
})

describe('zone — jamais France et Suisse mêlées (D4)', () => {
  it('france sans département est refusée', () => {
    expect(marketBriefSchema.safeParse(withZone({ departments: [] })).success).toBe(false)
  })

  it('france avec un canton est refusée', () => {
    expect(marketBriefSchema.safeParse(withZone({ cantons: ['VD'] })).success).toBe(false)
  })

  it('suisse avec un département est refusée', () => {
    expect(marketBriefSchema.safeParse(withZone({ scope: 'suisse', cantons: ['VD'] })).success).toBe(false)
  })

  it('suisse sans canton est refusée', () => {
    expect(marketBriefSchema.safeParse(withZone({ scope: 'suisse', departments: [], cantons: [] })).success).toBe(false)
  })

  it('suisse avec cantons seuls passe', () => {
    expect(
      marketBriefSchema.safeParse(withZone({ scope: 'suisse', departments: [], cantons: ['VD', 'GE'] })).success,
    ).toBe(true)
  })

  it('un département doit être un code INSEE', () => {
    expect(marketBriefSchema.safeParse(withZone({ departments: ['Nord'] })).success).toBe(false)
    expect(marketBriefSchema.safeParse(withZone({ departments: ['2A'] })).success).toBe(true)
  })
})

describe('price_grid', () => {
  const grid = (patch: Record<string, unknown>): Record<string, unknown> => ({
    ...clone(),
    price_grid: { ...(lille.price_grid as Record<string, unknown>), ...patch },
  })

  it('refuse une devise hors EUR/CHF', () => {
    expect(marketBriefSchema.safeParse(grid({ currency: 'USD' })).success).toBe(false)
  })

  it('refuse une source inconnue', () => {
    expect(marketBriefSchema.safeParse(grid({ source_kind: 'invented' })).success).toBe(false)
  })

  it('accepte les trois sources nommées par D6', () => {
    for (const source_kind of ['own_needs_missions', 'observed_public', 'provided_file']) {
      expect(marketBriefSchema.safeParse(grid({ source_kind })).success).toBe(true)
    }
  })

  it('refuse un prix nul ou négatif', () => {
    const rows = [{ family: 'Dev', needs: 5, median: 0 }]
    expect(marketBriefSchema.safeParse(grid({ rows })).success).toBe(false)
  })
})
