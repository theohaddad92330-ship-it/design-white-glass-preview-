// Client for the API's manager team-KPIs endpoints (GET /internal/analytics/teams*,
// guarded by InternalSecretGuard — cross-tenant, the operator sees ALL teams).
// Server-side only: the internal secret must never reach the browser. Mirrors
// src/lib/admin.ts / src/lib/telemetry.ts.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

// Windowed activity + funnel KPIs shared by the team row and the member row.
// Rates are null when non-derivable (0 messages / nobody onboarded) — the API
// never fabricates a figure and neither do we (render « — »).
// Décomposition d'un total d'envois par provenance. `verified` = Bellum a
// réellement expédié (email) ; `declared` = le commercial affirme avoir envoyé
// lui-même (LinkedIn) ; `unattributed` = historique non traçable. Exporté : la
// vue Équipes en formate l'affichage (src/app/teams/strings.ts).
/**
 * Ce que l'API dit quand elle REFUSE de publier une mesure — la forme de
 * `WithheldMetric` (`apps/api/.../product-analytics-read.service.ts`), miroir
 * local comme le reste de ce fichier : le back-office ne dépend pas de l'API.
 * Les NOMBRES ne sont pas recopiés — ils voyagent dans la charge utile.
 */
export type WithheldMeasure = {
  kind: 'below_threshold'
  metric: string
  subjects: number
  minSubjects: number
}

export type MessageSendBreakdown = {
  verified: number
  declared: number
  unattributed: number
  total: number
}

type TeamActivityKpis = {
  analysesStarted: number
  analysesCompleted: number
  // #4423.2 — mêmes définitions que la fiche utilisateur (`account-counts.ts` côté API).
  accountsLaunched: number
  accountsCompleted: number
  followedAccounts: number
  activeAccounts: number
  hotAccounts: number
  contactsEnriched: number
  // Total tous canaux — ne JAMAIS afficher sans `messages` à côté.
  messagesSent: number
  messages: MessageSendBreakdown
  responsesReceived: number
  rdvObtained: number
  dealsSigned: number
  responseRate: number | null
  rdvRate: number | null
  creditsConsumed: number
}

// Not exported: referenced only through TeamKpisSummary['teams'] (knip flags
// type exports consumed solely in their own file).
type TeamKpisRow = TeamActivityKpis & {
  workspaceId: string
  workspaceName: string | null
  memberCount: number
  onboardedMembers: number
  activatedMembers: number
  activationRate: number | null
  // #1681.1 — le retrait NOMMÉ, à côté du taux. L'API le rend depuis `90897cd95` ;
  // cet écran ne le lisait pas et rendait le même tiret qu'une absence de mesure.
  // `optional` : une réponse d'API antérieure au champ se rend exactement comme avant.
  activationWithheld?: WithheldMeasure | null
}

export type TeamKpisSummary = {
  windowDays: number
  generatedAt: string
  teams: TeamKpisRow[]
  notes: string[]
}

// Charge d'actions encore OUVERTES (instantané, pas une fenêtre). `overdue` /
// `dueSoon` / `undated` sont des sous-ensembles de `open`.
// Not exported: referenced only through the report types below.
type ActionWorkload = {
  open: number
  overdue: number
  dueSoon: number
  undated: number
}

// Not exported: referenced only through TeamKpisDetail['members'].
type TeamMemberKpis = TeamActivityKpis & {
  userId: string
  name: string
  email: string | null
  role: string
  onboardedAt: string | null
  activatedAt: string | null
  lastActivityAt: string | null
  // Optionnels : le backoffice peut être déployé AVANT l'API qui les sert. Un
  // champ absent se rend « — » / se masque — jamais 0 (« on ne sait pas » n'est
  // pas « zéro », et sur un tableau de bord de direction c'est toute la
  // différence entre « personne n'est en retard » et « on ne mesure pas »).
  portfolioAccounts?: number
  workload?: ActionWorkload
}

export type TeamKpisDetail = {
  windowDays: number
  generatedAt: string
  workspace: { id: string; name: string | null; memberCount: number }
  totals: TeamActivityKpis
  pipeline: Array<{ status: string; count: number }>
  members: TeamMemberKpis[]
  unattributedCredits: number
  // Idem : absents d'une API antérieure ⇒ blocs masqués, jamais rendus à zéro.
  workload?: ActionWorkload
  offTeamOpenActions?: number
  portfolio?: { assigned: number; unassigned: number }
  notes: string[]
}

async function kpisGet<T>(path: string): Promise<T> {
  const res = await fetch(`${REAL_BASE}/internal/analytics${path}`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Team-KPIs endpoint ${path} returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

function daysQuery(days?: number): string {
  return days && Number.isFinite(days) ? `?days=${Math.floor(days)}` : ''
}

export async function fetchTeamKpis(days?: number): Promise<TeamKpisSummary> {
  return kpisGet<TeamKpisSummary>(`/teams${daysQuery(days)}`)
}

export async function fetchTeamKpisDetail(workspaceId: string, days?: number): Promise<TeamKpisDetail> {
  return kpisGet<TeamKpisDetail>(`/teams/${encodeURIComponent(workspaceId)}${daysQuery(days)}`)
}

/* -------------------------------------------------------------------------- */
/*  Les trois familles d'indicateurs qui n'avaient AUCUN écran                 */
/* -------------------------------------------------------------------------- */

/**
 * `GET /internal/analytics/{crm-kpis,matching-kpis,quality}` existaient, testés,
 * documentés — et rien ne les appelait. Un indicateur juste que personne ne
 * regarde ne vaut pas mieux qu'un indicateur absent : il vaut moins, parce
 * qu'il donne l'impression que le sujet est couvert.
 *
 * Ils restent au BACK-OFFICE, et c'est une règle et non un oubli (arbitrage des
 * 31/07 et 03/08) : un taux affiché à un commercial devient une promesse
 * chiffrée qu'il faut tenir ; affiché à l'opérateur, il devient un outil pour
 * la tenir.
 */
export type CrmKpiRow = {
  key: string
  value: number | null
  unit: 'rate' | 'days' | 'count'
  sample: number
  breakdown?: Record<string, number>
}

export type MatchingKpiRow = {
  key: string
  value: number | null
  unit: 'rate' | 'days' | 'count'
  measurability: { measurable: boolean; observed: number; required: number }
}

export type QualityRow = {
  key: string
  label: string
  value: number | null
  unit: 'rate' | 'ms' | 'count'
  target?: number | null
  sample?: number
}

/**
 * Les trois lectures, chacune tolérante à SON échec.
 *
 * Un `Promise.all` ferait disparaître les trois blocs parce qu'un seul a
 * échoué — et l'écran ne dirait pas lequel. Chaque famille rend `null` pour
 * elle-même : « je n'ai pas pu regarder » n'est pas « il n'y a rien ».
 */
export async function fetchDeepKpis(
  workspaceId: string,
  days?: number,
): Promise<{ crm: CrmKpiRow[] | null; matching: MatchingKpiRow[] | null; quality: QualityRow[] | null }> {
  const id = encodeURIComponent(workspaceId)
  const [crm, matching, quality] = await Promise.all([
    kpisGet<{ kpis: CrmKpiRow[] }>(`/crm-kpis/${id}${daysQuery(days)}`)
      .then(payload => payload.kpis ?? [])
      .catch(() => null),
    kpisGet<{ kpis: MatchingKpiRow[] }>(`/matching-kpis/${id}`)
      .then(payload => payload.kpis ?? [])
      .catch(() => null),
    kpisGet<{ indicators: QualityRow[] }>(`/quality${daysQuery(days)}`)
      .then(payload => payload.indicators ?? [])
      .catch(() => null),
  ])
  return { crm, matching, quality }
}
