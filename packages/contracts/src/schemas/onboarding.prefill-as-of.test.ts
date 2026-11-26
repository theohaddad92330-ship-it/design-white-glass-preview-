import { describe, expect, it } from 'vitest'
import { prefilledFieldSchema } from './onboarding.js'

/**
 * #2028.2 — la DATE d'une valeur préremplie rejoint le contrat.
 *
 * `as_of` est ADDITIF et `nullable().default(null)` (même patron que
 * `naf_code` sur `prefillCompanySchema`) : un producteur IA antérieur à ce
 * contrat, qui n'émet pas encore la date (#2028.8, `à trancher`), continue de
 * parser sans erreur — et le champ absent doit rester `null`, jamais une date
 * devinée.
 */
describe('prefilledFieldSchema — #2028.2 la date de la donnée préremplie', () => {
  it('accepte un champ SANS `as_of` (producteur IA actuel) et le rend `null`', () => {
    const parsed = prefilledFieldSchema.parse({ value: '10-30', confidence: 'medium', source: 'pappers' })
    expect(parsed.as_of).toBeNull()
  })

  it('porte la date quand la source la fournit', () => {
    const parsed = prefilledFieldSchema.parse({
      value: '10-30',
      confidence: 'medium',
      source: 'pappers',
      as_of: '2025-01-15',
    })
    expect(parsed.as_of).toBe('2025-01-15')
  })

  it('refuse `as_of` comme un champ requis — `null` explicite reste valide', () => {
    const parsed = prefilledFieldSchema.parse({ value: '10-30', confidence: 'medium', source: 'pappers', as_of: null })
    expect(parsed.as_of).toBeNull()
  })
})
