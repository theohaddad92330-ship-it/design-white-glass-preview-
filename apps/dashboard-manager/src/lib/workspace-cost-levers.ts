// Client des CINQ LEVIERS de coût IA, en lecture (GET /internal/admin/workspaces/:id/budget, gardé
// par InternalSecretGuard, #2975 / #2440.83-89). Appelé CÔTÉ SERVEUR uniquement — même forme que
// `./workspace-cost-ledger.ts` : le secret interne ne doit jamais atteindre le navigateur.

import type { WorkspaceBudgetLevers } from '@bellum/contracts'

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

/**
 * Lit les leviers d'UN espace (jamais agrégés entre espaces, GA-43). Un espace qui n'a rien réglé
 * rend « aucun plafond » (`null`) — jamais 0.
 *
 * ⚠️ Aucun repli inventé : une panne remonte en exception, et le panneau DIT qu'il n'a pas la
 * donnée plutôt que d'afficher des plafonds vides qu'on pourrait écraser par erreur.
 */
export async function fetchWorkspaceCostLevers(workspaceId: string): Promise<WorkspaceBudgetLevers> {
  const res = await fetch(`${REAL_BASE}/internal/admin/workspaces/${encodeURIComponent(workspaceId)}/budget`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`workspace cost levers a répondu ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as WorkspaceBudgetLevers
}
