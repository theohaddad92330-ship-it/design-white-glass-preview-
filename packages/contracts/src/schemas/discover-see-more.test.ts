import { describe, expect, it } from 'vitest'
import { DISCOVER_MAX_LIMIT, discoverRegistryRequestSchema, discoverSignalsRequestSchema } from './discover.js'

/**
 * #4016 L7 — décision Louis 11/10/2026 : Découvrir SANS PALIER.
 *
 * Le volume de la capacité commerciale (10 / 25 / 50, `discover-capacity.ts`)
 * n'est plus qu'un PREMIER LOT ; « Voir plus » relance la recherche avec un
 * `limit` plus grand. La borne d'ici n'est plus un palier produit (50 = le plus
 * haut palier), c'est une borne TECHNIQUE (budget de temps d'une requête),
 * miroir de `MAX_REGISTRY_LIMIT` (`apps/ia/app/routers/discover.py`).
 */
describe('Découvrir sans palier — la borne du « Voir plus »', () => {
  it('dépasse le plus haut palier de capacité (50) : « Voir plus » continue au-delà', () => {
    expect(DISCOVER_MAX_LIMIT).toBe(200)
    expect(discoverRegistryRequestSchema.safeParse({ limit: 74 }).success).toBe(true)
    expect(discoverSignalsRequestSchema.safeParse({ limit: 200 }).success).toBe(true)
  })

  it('SAIT DIRE NON : au-delà de la borne technique, la requête est refusée', () => {
    expect(discoverRegistryRequestSchema.safeParse({ limit: DISCOVER_MAX_LIMIT + 1 }).success).toBe(false)
    expect(discoverSignalsRequestSchema.safeParse({ limit: DISCOVER_MAX_LIMIT + 1 }).success).toBe(false)
  })
})
