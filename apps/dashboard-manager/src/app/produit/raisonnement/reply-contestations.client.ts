// Client pour l'agrégat des contestations/corrections des réponses de Laura, PAR FONCTION
// (GET /internal/analytics/reply-contestations, gardé par InternalSecretGuard).
// Server-side only — le secret interne ne doit jamais atteindre le navigateur.
//
// #2442.10 (lot W9) — troisième exception nommée à c64 (Louis 11/10/2026) : une fonction, jamais une personne.
// MIROIR de `ReplyContestationReport` (`apps/api/src/modules/analytics/reply-contestations.ts`) — les deux
// applications se déploient séparément, un import direct entre elles n'existe pas.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

type LigneContestation = {
  tool: string
  replies: number
  feedbacks: number
  contested: number
  corrected: number
  /** `null` sans aucun retour — jamais « 0 % » d'une absence. */
  contestedShare: number | null
}

export type RapportContestations = {
  windowDays: number
  minDistinctReplies: number
  byTool: LigneContestation[]
  /** Fonctions retenues sous le plancher : un COMPTE, jamais leur nom. */
  withheldTools: number
}

export async function fetchReplyContestations(days?: number): Promise<RapportContestations> {
  const url = new URL('/internal/analytics/reply-contestations', REAL_BASE)
  if (days !== undefined) url.searchParams.set('days', String(days))
  const res = await fetch(url, { headers: { 'x-internal-secret': REAL_SECRET }, cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`reply-contestations endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as RapportContestations
}
