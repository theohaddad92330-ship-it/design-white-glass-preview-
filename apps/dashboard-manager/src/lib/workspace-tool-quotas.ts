// Client du QUOTA QUOTIDIEN PAR OUTIL, en lecture (GET /internal/admin/workspaces/:id/budget/tool-quotas,
// gardé par InternalSecretGuard, #2975 / #2440.45). Appelé CÔTÉ SERVEUR uniquement — même forme que
// `./workspace-cost-levers.ts` : le secret interne ne doit jamais atteindre le navigateur.

import type { ToolDailyCapStatus } from '@bellum/contracts'

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

/**
 * Lit, pour UN espace (jamais agrégé entre espaces, GA-43), chaque outil réglé par l'exploitant
 * (`AI_TOOL_DAILY_CAP_USD`) et sa dépense du jour. Liste vide = aucun quota réglé.
 *
 * ⚠️ Aucun repli inventé : une panne remonte en exception, le panneau DIT qu'il n'a pas la donnée.
 */
export async function fetchWorkspaceToolQuotas(workspaceId: string): Promise<ToolDailyCapStatus[]> {
  const res = await fetch(
    `${REAL_BASE}/internal/admin/workspaces/${encodeURIComponent(workspaceId)}/budget/tool-quotas`,
    { headers: { 'x-internal-secret': REAL_SECRET }, cache: 'no-store' },
  )
  if (!res.ok) {
    throw new Error(`workspace tool quotas a répondu ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as ToolDailyCapStatus[]
}
