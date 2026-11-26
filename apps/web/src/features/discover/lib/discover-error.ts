import { ApiError } from '@/lib/api'

/**
 * #2535.1 — `POST /ia/discover/registry` (et `/signals`) est coupé à 45 s
 * (`DISCOVER_CALL_OPTS`, `apps/api/src/modules/ia-proxy/ia-proxy.controller.ts:159`)
 * quand une analyse tourne en parallèle → 503, mesuré en production le 17/09.
 * Le serveur classe déjà la VRAIE cause (`classifyDiscoverFailure`,
 * `apps/api/src/modules/ia-proxy/discover-failure.ts`) et la pose dans le
 * `code` de la réponse d'erreur (`discover_timeout` / `discover_invalid_filters`
 * / `discover_upstream_error`) — l'écran l'ignorait et affichait TOUJOURS
 * « Le service n'a pas pu être joint », qu'il s'agisse d'une vraie panne ou
 * d'une recherche coupée pendant qu'une autre tournait.
 *
 * Même patron que `enrichErrorDescription` (contacts, `useEnrichContact.ts`) :
 * on localise ICI (FR+EN), on n'échoue jamais la phrase brute du serveur —
 * elle n'est de toute façon pas traduite côté API.
 */
export function discoverErrorHintKey(error: unknown): string {
  const code = error instanceof ApiError ? error.code : undefined
  switch (code) {
    case 'discover_timeout':
      return 'states.errorHintTimeout'
    case 'discover_invalid_filters':
      return 'states.errorHintInvalidFilters'
    case 'discover_upstream_error':
      return 'states.errorHintUpstream'
    default:
      // Pas de code : panne réseau, ou endpoint qui ne s'explique pas encore.
      // Le message générique reste le repli, comme avant ce lot.
      return 'states.errorHint'
  }
}
