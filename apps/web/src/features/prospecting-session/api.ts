import type {
  ProspectingSessionMetricsResponse,
  RecordProspectingSessionEventRequest,
  StartProspectingSessionRequest,
  StartProspectingSessionResponse,
} from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

/**
 * #2386.9 — LE SEUL LECTEUR/ÉCRIVAIN CÔTÉ WEB de `prospecting_sessions`.
 * `start` est appelé par `ProspectingSessionDialog` au moment où une session
 * est GÉNÉRÉE, best-effort (son échec ne doit jamais empêcher d'afficher la
 * session déjà construite — même discipline que `contactsApi.solicitations`,
 * #2386.6).
 */
export const prospectingSessionsApi = {
  start(input: StartProspectingSessionRequest): Promise<StartProspectingSessionResponse> {
    return apiFetch<StartProspectingSessionResponse, StartProspectingSessionRequest>({
      path: '/prospecting-sessions',
      method: 'POST',
      body: input,
    })
  },
  recordEvent(id: string, event: RecordProspectingSessionEventRequest): Promise<void> {
    return apiFetch<void, RecordProspectingSessionEventRequest>({
      path: `/prospecting-sessions/${id}/events`,
      method: 'POST',
      body: event,
    })
  },
  metrics(): Promise<ProspectingSessionMetricsResponse> {
    return apiFetch<ProspectingSessionMetricsResponse>({ path: '/prospecting-sessions/metrics' })
  },
}

/** L'agrégat PAR PARCOURS (#2386.9) — jamais lu plus d'une fois par minute :
 *  ce n'est pas un compteur temps réel, un écran ouvert ne doit pas le
 *  re-solliciter à chaque rendu. */
export function useProspectingSessionMetrics() {
  return useQuery({
    queryKey: ['prospecting-sessions', 'metrics'],
    queryFn: prospectingSessionsApi.metrics,
    staleTime: 60_000,
  })
}
