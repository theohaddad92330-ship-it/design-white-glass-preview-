// Client de la santé des espaces clients (GET /internal/admin/client-health,
// gardé par InternalSecretGuard). Appelé CÔTÉ SERVEUR uniquement — le secret
// interne ne doit jamais atteindre le navigateur. Même forme que
// src/lib/business-metrics.ts et src/lib/admin.ts.
//
// ⚠️ AUCUNE ÉCRITURE ICI. On lit une mesure. Les quatre actions de la ligne
// (incarner, suspendre, changer d'offre, créditer) passent par les routes
// `/api/admin/users/[userId]/…` qui existaient déjà, chacune avec sa capacité
// et son journal — rien n'est réécrit dans ce lot (#1652).

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

/** Les cinq axes de #1652, tels que l'API les nomme. Local : ils voyagent dans
 *  `ClientHealth` (règle « pas de type exporté sans lecteur ailleurs », knip). */
type ClientHealthAxisKey = 'activite' | 'adoption' | 'credits' | 'sieges' | 'incidents'

/**
 * Un axe du score.
 *
 * ⚠️ `ratio` est `number | null` et le RESTE jusqu'à l'écran : un `?? 0` ici
 * annulerait toute la règle « un axe sans donnée sort du dénominateur ».
 * `unmeasured` porte la raison — c'est ce qui rend l'absence lisible.
 */
type ClientHealthAxis = {
  key: ClientHealthAxisKey
  label: string
  weight: number
  ratio: number | null
  detail: string | null
  unmeasured: string | null
}

/**
 * Le verdict. Trois formes — et deux d'entre elles ne sont PAS des zéros :
 * `too_recent` (moins de 14 jours) et `not_enough_axes` (moins de 3 axes
 * mesurés) se rangent à part, à l'écran comme au tri.
 */
export type ClientHealth =
  | { kind: 'score'; score: number; measured: number; churnRisk: boolean; axes: ClientHealthAxis[] }
  | { kind: 'too_recent'; ageDays: number; measured: number; axes: ClientHealthAxis[] }
  | { kind: 'not_enough_axes'; measured: number; axes: ClientHealthAxis[] }

/** Local : ne voyage que dans `ClientRow` (knip). */
type ClientBilling = {
  mode: 'stripe' | 'manual' | 'unknown'
  contractedCents: number | null
  period: string | null
}

/** Une ligne de `/revenus/clients` : un ESPACE, jamais une personne. */
export type ClientRow = {
  workspaceId: string
  name: string
  ownerUserId: string
  ownerEmail: string | null
  plan: string | null
  planLabel: string | null
  /** `null` = pas de MRR à dire (sur facture, sans abonnement, palier hors grille). */
  mrrCents: number | null
  seats: number | null
  memberCount: number
  activeMembers: number | null
  createdAt: string
  lastActivityAt: string | null
  creditsUsed: number | null
  creditsAllowance: number | null
  billing: ClientBilling
  health: ClientHealth
}

export type ClientHealthReport = {
  rows: ClientRow[]
  total: number
  /** La fenêtre d'adoption et d'incidents, dite à l'écran plutôt que devinée. */
  windowDays: number
  /** Le catalogue OBSERVÉ de fonctions. `null` = aucun geste enregistré. */
  featureCatalogue: number | null
  computedAt: string
}

/**
 * Lit la santé des espaces.
 *
 * ⚠️ Aucun repli inventé : une panne remonte en exception, et l'écran DIT
 * qu'il n'a pas la donnée. Un tableau vide se lirait « aucun client ».
 */
export async function fetchClientHealth(search?: string): Promise<ClientHealthReport> {
  const query = search ? `?search=${encodeURIComponent(search)}` : ''
  const res = await fetch(`${REAL_BASE}/internal/admin/client-health${query}`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`client-health a répondu ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as ClientHealthReport
}
