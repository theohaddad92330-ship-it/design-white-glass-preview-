import { describe, expect, it } from 'vitest'
import { discoverRegistryFiltersSchema } from './discover.js'

/**
 * #2165.28 / #2165.30 — les deux critères SERVEUR de la mémoire marché sur
 * `POST /ia/discover/registry` : « technologies observées » et « recours
 * externe observé » (`observed-esn.ts`). Le registre n'en sait rien lui-même —
 * l'API les résout en masse, après le registre (`DiscoverMarketMemoryService`).
 *
 * ⚠️ Doctrine c65 (GA-259) : `externalRecourseObserved` ne filtre que sur
 * `true`. Accepter `false` comme un filtre inverserait la doctrine — un compte
 * NON OBSERVÉ n'est jamais un compte qui « n'externalise pas ».
 */
describe('discoverRegistryFiltersSchema — mémoire marché (#2165.28 / #2165.30)', () => {
  it('laisse passer un critère de technologies observées', () => {
    const parsed = discoverRegistryFiltersSchema.parse({ technologiesObserved: ['java', 'sql'] })
    expect(parsed.technologiesObserved).toEqual(['java', 'sql'])
  })

  it('laisse passer le recours externe observé', () => {
    const parsed = discoverRegistryFiltersSchema.parse({ externalRecourseObserved: true })
    expect(parsed.externalRecourseObserved).toBe(true)
  })

  it('accepte un objet sans ces critères — no-op strict', () => {
    const parsed = discoverRegistryFiltersSchema.parse({ sector: 'Banque' })
    expect(parsed.technologiesObserved).toBeUndefined()
    expect(parsed.externalRecourseObserved).toBeUndefined()
  })
})
