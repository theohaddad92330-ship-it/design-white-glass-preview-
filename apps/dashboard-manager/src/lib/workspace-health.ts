import type { DimensionIntervention, HealthDimensionView, WorkspaceHealth } from '@bellum/contracts'

// Client de la santé PRODUIT d'un espace (GET /internal/admin/workspace-health/:id,
// gardé par InternalSecretGuard, #2977). Appelé CÔTÉ SERVEUR uniquement — même
// forme que `./client-health.ts` : le secret interne ne doit jamais atteindre
// le navigateur.
//
// ⚠️ Ce n'est PAS `client-health.ts` (#1652, revenu/relation, 5 axes). Celui-ci
// est le score PRODUIT à 9 axes du §5.6 — jamais montré à l'utilisateur, jamais
// affiché ailleurs qu'ici. Les fusionner ferait mentir l'un des deux dénominateurs.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

export type WorkspaceHealthReport = {
  workspaceId: string
  health: WorkspaceHealth
  /** « X/9 axes évalués » — jamais un score affiché nu. */
  coverageLabel: string
  dimensions: HealthDimensionView[]
  interventions: DimensionIntervention[]
}

/**
 * Lit la santé produit d'UN espace.
 *
 * ⚠️ Aucun repli inventé : une panne remonte en exception, et l'écran DIT
 * qu'il n'a pas la donnée plutôt que de taire le panneau.
 */
export async function fetchWorkspaceHealth(workspaceId: string): Promise<WorkspaceHealthReport> {
  const res = await fetch(`${REAL_BASE}/internal/admin/workspace-health/${encodeURIComponent(workspaceId)}`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`workspace-health a répondu ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as WorkspaceHealthReport
}
