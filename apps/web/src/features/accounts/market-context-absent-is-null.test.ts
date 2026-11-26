import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * #1608, #1640.3 — « PAS COUVERT » DOIT ARRIVER JUSQU'AU COMPOSANT.
 *
 * `apiFetch` rend désormais `undefined` pour un corps vide sur un 200 (le
 * `null` que NestJS sérialise en rien du tout — voir `lib/api.test.ts`). Mais
 * **React Query v5 REFUSE un `queryFn` qui rend `undefined`** : il lève
 * « Query data cannot be undefined » et la requête part en `isError`. On
 * aurait donc corrigé le transport et gardé exactement le même écran :
 * « Mémoire marché indisponible » au lieu de « Non mesuré ».
 *
 * Chaque porte qui lit cette route normalise donc `undefined` en `null` — la
 * valeur que le contrat annonce (`AccountMarketContext | null`) et la seule que
 * les deux cartes savent traduire en « Non mesuré ».
 *
 * ⚠️ Il y a DEUX portes, et elles partagent la même clé de cache
 * `['accounts', 'market-context', id]` : `accountsApi.getMarketContext` (utilisé
 * par `useAccountMarketContext`, donc par la vue d'ensemble et l'onglet Sites)
 * et la requête écrite en ligne dans `TabAccess`, qui n'utilise pas le hook
 * partagé (son docblock dit pourquoi : le hook dépend de `useSession`, que cet
 * écran n'a jamais eu). Les deux normalisent.
 *
 * Ce test ne garde QUE la première — celle dont dépend l'écran fautif. La
 * seconde est normalisée pour que la même entrée de cache ne vaille pas `null`
 * ou une erreur selon l'onglet ouvert en premier ; à l'écran, `TabAccess` se
 * comporte pareil dans les deux cas (sa carte se cache), donc il n'y a rien
 * d'observable à garder, et une garde qui lirait son SOURCE deviendrait fausse
 * au premier renommage.
 */

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

describe('mémoire marché — un compte non couvert rend null, jamais undefined', () => {
  beforeEach(() => apiFetch.mockReset())

  it('accountsApi.getMarketContext normalise undefined en null', async () => {
    const { accountsApi } = await import('./api')
    apiFetch.mockResolvedValueOnce(undefined)

    await expect(accountsApi.getMarketContext('acc-1')).resolves.toBeNull()
  })

  it('et laisse passer une lecture réussie telle quelle', async () => {
    const { accountsApi } = await import('./api')
    const couvert = {
      paths_observed: 135,
      esn_observed: 6,
      observed_zone: { city: null, region: null, country: 'France' },
    }
    apiFetch.mockResolvedValueOnce(couvert)

    await expect(accountsApi.getMarketContext('acc-1')).resolves.toEqual(couvert)
  })
})
