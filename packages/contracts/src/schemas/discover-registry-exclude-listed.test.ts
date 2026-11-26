import { describe, expect, it } from 'vitest'
import { discoverRegistryFiltersSchema, discoverResponseSchema } from './discover.js'

/**
 * #4361.2 — « Exclure les sociétés cotées » traverse le contrat : sans la clé au schéma, zod la
 * RETIRE en silence (le DTO de l'API parse ce schéma) et l'interrupteur n'atteindrait jamais le moteur.
 */
describe('discoverRegistryFiltersSchema — excludeListed (#4361.2)', () => {
  it('conserve le critère posé, combiné à une tranche', () => {
    const parsed = discoverRegistryFiltersSchema.parse({ excludeListed: true, headcountMin: 250, headcountMax: 4999 })
    expect(parsed).toEqual({ excludeListed: true, headcountMin: 250, headcountMax: 4999 })
  })

  it('un booléen seulement : une autre valeur est refusée, jamais devinée', () => {
    expect(discoverRegistryFiltersSchema.safeParse({ excludeListed: 'oui' }).success).toBe(false)
  })
})

describe('discoverResponseSchema — listingFilter (#4361.2)', () => {
  const base = { candidates: [], query: {}, degraded: [] }

  it('porte les deux nombres et la disponibilité de la source', () => {
    const listingFilter = { applied: true, excludedCount: 2, unknownCount: 14, sourceAvailable: false }
    expect(discoverResponseSchema.parse({ ...base, listingFilter }).listingFilter).toEqual(listingFilter)
  })

  it('reste absent sans interrupteur : pas de « 0 retirée » inventé', () => {
    expect('listingFilter' in discoverResponseSchema.parse(base)).toBe(false)
  })
})
