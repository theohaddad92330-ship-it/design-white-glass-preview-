import { ConsultantsService } from './consultants.service'

/**
 * #2185.48 — « Valider disponibilité » : revalider la disponibilité DÉCLARÉE
 * sans en changer la valeur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * Toucher `availability`/`available_from` via l'édition générale (`update`)
 * revalide déjà `availability_checked_at` — mais SEULEMENT quand la valeur
 * change (`patchFromUpsert`). Confirmer une disponibilité qui reste juste
 * (« oui, toujours disponible sous un mois ») n'avait AUCUN chemin : re-saisir
 * la même valeur dans le formulaire d'édition ne déclenche aucune écriture,
 * donc aucune revalidation de la fraîcheur.
 */

function serviceWith(row: Record<string, unknown>) {
  const saved: Record<string, unknown>[] = []
  const repo = {
    findOne: async () => row,
    save: async (entity: Record<string, unknown>) => {
      saved.push(entity)
      return entity
    },
  }
  const service = new ConsultantsService(
    repo as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  )
  // `findScoped` est privée et fait sa propre requête — court-circuitée ici,
  // le sujet du test étant l'écriture, pas le cloisonnement (déjà couvert
  // ailleurs, `reactivate-consent.spec.ts` par exemple).
  ;(service as unknown as { findScoped: () => Promise<unknown> }).findScoped = async () => row
  ;(service as unknown as { toWire: (r: unknown) => unknown }).toWire = (r: unknown) => r
  return { service, saved }
}

describe('confirmAvailability — revalide la fraîcheur sans changer la valeur déclarée', () => {
  it('bump `availability_checked_at` à maintenant, sans toucher `availability`', async () => {
    const old = new Date('2026-01-01T00:00:00Z')
    const { service, saved } = serviceWith({
      id: 'c1',
      availability: 'sous_1_mois',
      availability_checked_at: old,
    })

    const before = Date.now()
    await service.confirmAvailability('c1', 'w1', 'u1')
    const after = Date.now()

    expect(saved).toHaveLength(1)
    expect(saved[0].availability).toBe('sous_1_mois')
    const checkedAt = saved[0].availability_checked_at as Date
    expect(checkedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(checkedAt.getTime()).toBeLessThanOrEqual(after)
  })

  it('rend `null` sur une fiche hors du périmètre de l’espace — jamais une écriture à l’aveugle', async () => {
    const repo = { findOne: async () => null, save: async () => null }
    const service = new ConsultantsService(
      repo as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
    )
    ;(service as unknown as { findScoped: () => Promise<unknown> }).findScoped = async () => null

    await expect(service.confirmAvailability('missing', 'w1', 'u1')).resolves.toBeNull()
  })
})
