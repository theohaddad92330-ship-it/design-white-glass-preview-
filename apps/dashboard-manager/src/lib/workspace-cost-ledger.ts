// Client du LEDGER de coût IA, en lecture (GET
// /internal/admin/workspaces/:id/budget/ledger, gardé par InternalSecretGuard,
// #2975). Appelé CÔTÉ SERVEUR uniquement — même forme que `./workspace-health.ts` :
// le secret interne ne doit jamais atteindre le navigateur.
//
// ⚠️ Ce n'est PAS un agrégat : chaque ligne de `provider_costs` telle qu'écrite,
// scopée à UN SEUL espace (GA-43 — jamais agrégée entre espaces, ce sont des
// concurrents). La somme se lit ailleurs (`checkGate`) ; ceci répond à la
// question qui suit toujours « combien ? » — « lequel, sur quoi, et quand ? ».

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

export type WorkspaceCostLedgerEntry = {
  id: string
  feature: string
  provider: string
  operation: string
  calls: number
  units: number
  /** `null` = fournisseur non tarifé — jamais un coût inventé (GA-18/GA-19). */
  costUsd: number | null
  /** #2440.46 — `provider_limit` = refus du fournisseur (429 / surcharge), sans débit ; `null` = aucun statut déclaré. */
  status: string | null
  createdAt: string
}

/**
 * Lit le ledger du mois civil en cours pour UN espace.
 *
 * ⚠️ Aucun repli inventé : une panne remonte en exception, et le panneau DIT
 * qu'il n'a pas la donnée plutôt que de taire le tableau.
 */
export async function fetchWorkspaceCostLedger(workspaceId: string): Promise<WorkspaceCostLedgerEntry[]> {
  const res = await fetch(`${REAL_BASE}/internal/admin/workspaces/${encodeURIComponent(workspaceId)}/budget/ledger`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`workspace cost ledger a répondu ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as WorkspaceCostLedgerEntry[]
}
