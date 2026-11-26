// Client pour la LECTURE des sessions d'impersonation
// (GET /internal/admin/impersonations, gardé par InternalSecretGuard).
// Serveur uniquement — le secret interne ne touche jamais le navigateur.
// Mirrors src/lib/etat-securite.ts et src/lib/journal-audit.ts.

/**
 * #1665.2 — « aucun GET n'expose les sessions d'impersonation ». Ce module ne
 * calcule RIEN : la jointure start/stop par `jti` est faite côté API
 * (`joinImpersonationSessions`, pure et testée là-bas). Ici on ne fait que
 * lire.
 */

const BASE = (): string | undefined => process.env['API_BASE_URL']
const SECRET = (): string | undefined => process.env['INTERNAL_API_SECRET']

export type StatutSession = 'ongoing' | 'ended' | 'expired_sans_arret'

export type SessionImpersonation = {
  jti: string
  actor: string
  targetUserId: string
  targetEmail: string | null
  reason: string
  reasonCode: string | null
  /** LUDOVIC-D LC.10 — la précision libre du motif, `null` si aucune. */
  reasonDetail: string | null
  startedAt: string
  endedAt: string | null
  /** LUDOVIC-D LC.10 — qui a terminé (un admin, ou l'opérateur lui-même) ; `null` sans arrêt. */
  endedBy: string | null
  status: StatutSession
  durationSeconds: number | null
  ip: string | null
}

/**
 * Les sessions d'impersonation récentes, jointes par `jti`.
 *
 * ⚠️ JETTE quand l'API ne répond pas — même règle que `fetchEtatSecurite` :
 * un tableau vide sur une panne se lirait comme « personne n'a incarné
 * personne », ce qui n'est pas ce qu'on sait.
 */
export async function fetchImpersonations(limit?: number): Promise<SessionImpersonation[]> {
  const base = BASE()
  const secret = SECRET()
  if (!base || !secret) {
    throw new Error('API_BASE_URL ou INTERNAL_API_SECRET non configuré côté console.')
  }

  const params = new URLSearchParams()
  if (limit !== undefined) params.set('limit', String(limit))
  const query = params.toString()

  const res = await fetch(`${base}/internal/admin/impersonations${query ? `?${query}` : ''}`, {
    headers: { 'x-internal-secret': secret },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Le service d’impersonation a répondu ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as { sessions: SessionImpersonation[] }
  return data.sessions
}
