// Client de la recette produit « première preuve »
// (GET /internal/analytics/first-proof-verdicts, gardé par InternalSecretGuard).
// Server-side only — le secret interne ne doit jamais atteindre le navigateur.
//
// issue 2076.13 — « ce retour enrichit le workspace ET la recette produit ».
// Même patron que `unrouted-intents.client.ts`. La forme ci-dessous est un
// MIROIR de `FirstProofRecetteReport` (`apps/api/src/modules/account-feedback/
// first-proof-recette.service.ts`) — les deux applications se déploient
// séparément, un import direct entre elles n'existe pas.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

export const FIRST_PROOF_VERDICTS = ['juste', 'partiel', 'faux', 'manquant'] as const

export type RapportPremierePreuve = {
  windowDays: number
  verdicts: Record<(typeof FIRST_PROOF_VERDICTS)[number], number>
  shared: number
  distinctWorkspaces: number
  withheldPrivate: number
  computedAt: string
}

export async function fetchFirstProofVerdicts(days?: number): Promise<RapportPremierePreuve> {
  const url = new URL('/internal/analytics/first-proof-verdicts', REAL_BASE)
  if (days !== undefined) url.searchParams.set('days', String(days))
  const res = await fetch(url, { headers: { 'x-internal-secret': REAL_SECRET }, cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`first-proof-verdicts endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as RapportPremierePreuve
}
