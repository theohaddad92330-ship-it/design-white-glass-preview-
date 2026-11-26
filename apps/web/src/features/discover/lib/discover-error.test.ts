import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api'
import { discoverErrorHintKey } from './discover-error'

/**
 * #2535.1 — `POST /ia/discover/registry` est coupé à 45 s (`DISCOVER_CALL_OPTS`)
 * quand une analyse tourne en parallèle → 503, mesuré en production le 17/09
 * (moteur au repos : 11,9 s et 24 résultats — le budget suffit hors charge).
 * Le serveur classe déjà la VRAIE cause (`classifyDiscoverFailure`,
 * `apps/api/src/modules/ia-proxy/discover-failure.ts`) dans `code`
 * (`discover_timeout` / `discover_invalid_filters` / `discover_upstream_error`),
 * mais l'écran affichait TOUJOURS « Le service n'a pas pu être joint » —
 * même patron corrigé que `enrichErrorDescription` (contacts) : on localise
 * ICI, on n'échoue jamais la phrase brute du serveur.
 */
describe('discoverErrorHintKey', () => {
  it('distingue le délai dépassé du reste', () => {
    expect(discoverErrorHintKey(new ApiError('x', 503, 'discover_timeout'))).toBe('states.errorHintTimeout')
  })

  it('distingue une panne amont d’un timeout', () => {
    expect(discoverErrorHintKey(new ApiError('x', 503, 'discover_upstream_error'))).toBe('states.errorHintUpstream')
  })

  it('distingue des critères refusés', () => {
    expect(discoverErrorHintKey(new ApiError('x', 422, 'discover_invalid_filters'))).toBe(
      'states.errorHintInvalidFilters',
    )
  })

  it('retombe sur le message générique sans code reconnu (panne réseau, endpoint muet)', () => {
    expect(discoverErrorHintKey(new ApiError('x', 500))).toBe('states.errorHint')
    expect(discoverErrorHintKey(new Error('network down'))).toBe('states.errorHint')
    expect(discoverErrorHintKey(undefined)).toBe('states.errorHint')
  })
})
