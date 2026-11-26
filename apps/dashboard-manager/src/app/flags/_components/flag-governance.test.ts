import { describe, expect, it } from 'vitest'
import { flagGovernance } from './flag-governance'

/**
 * #2446.8 — rollout par cohortes ordonnées, chaque flag a un owner et un
 * rollback. Reflag ne porte ni l'un ni l'autre (`flag-coverage.ts` le
 * documente déjà pour le ciblage) : ce registre statique les tient, sans
 * inventer d'owner pour un flag qu'il ne connaît pas.
 */
describe('flagGovernance', () => {
  it('renvoie owner et rollback pour un flag au registre', () => {
    const gouvernance = flagGovernance('market_memory_partners_enabled')
    expect(gouvernance.registered).toBe(true)
    if (gouvernance.registered) {
      expect(gouvernance.owner.length).toBeGreaterThan(0)
      expect(gouvernance.rollback.length).toBeGreaterThan(20)
    }
  })

  it("nomme l'absence plutôt que d'inventer un owner pour un flag inconnu", () => {
    const gouvernance = flagGovernance('flag_jamais_declare_ici')
    expect(gouvernance.registered).toBe(false)
    if (!gouvernance.registered) {
      expect(gouvernance.raison).toMatch(/flag_jamais_declare_ici/)
      expect(gouvernance.raison.length).toBeGreaterThan(20)
    }
  })
})
