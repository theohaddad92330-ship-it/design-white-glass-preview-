// Client de la consommation de crédits (GET /internal/admin/credit-consumption,
// gardé par InternalSecretGuard). Appelé CÔTÉ SERVEUR uniquement — le secret
// interne ne doit jamais atteindre le navigateur. Même forme que
// src/lib/client-health.ts. LECTURE SEULE : l'ajustement d'un solde passe par la
// route `/api/admin/users/[userId]/credits`, qui existait déjà (#4467).
//
// #4468 — les crédits sont implicites côté client : cette lecture est le SEUL
// endroit où la consommation se voit. Le coût fournisseur n'y figure pas, et
// rien n'y est agrégé entre espaces (GA-43).

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

/** Un espace : le solde de son pool partagé, et ce qui y a été consommé. */
export type WorkspaceConsumptionRow = {
  workspaceId: string
  name: string
  ownerUserId: string
  plan: string | null
  memberCount: number
  capacity: number | null
  /** `null` = non mesurable (illimité, ou pas d'abonnement) — JAMAIS « 0 ». */
  remaining: number | null
  consumed: number
  renewsAt: string | null
  exhausted: boolean
  unlimited: boolean
}

/** Un membre : sa consommation propre, et le solde du pool de son espace. */
export type UserConsumptionRow = {
  userId: string
  email: string | null
  workspaceId: string
  workspaceName: string
  /** `null` = non mesuré (le grand livre est muet) — JAMAIS « 0 ». */
  consumed: number | null
  remaining: number | null
  renewsAt: string | null
  exhausted: boolean
}

export type CreditConsumptionReport = {
  windowDays: number
  workspaces: WorkspaceConsumptionRow[]
  users: UserConsumptionRow[]
  /** Les comptes dont l'espace a un solde épuisé — ceux qui voient le frein doux. */
  exhausted: UserConsumptionRow[]
}

/**
 * Lit la consommation.
 *
 * ⚠️ Aucun repli inventé : une panne remonte en exception, et l'écran DIT qu'il
 * n'a pas la donnée. Un tableau vide se lirait « personne n'a rien consommé ».
 */
export async function fetchCreditConsumption(search?: string): Promise<CreditConsumptionReport> {
  const query = search ? `?search=${encodeURIComponent(search)}` : ''
  const res = await fetch(`${REAL_BASE}/internal/admin/credit-consumption${query}`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`credit-consumption a répondu ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as CreditConsumptionReport
}
