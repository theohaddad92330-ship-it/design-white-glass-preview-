// Client for the API's super-admin backoffice endpoints (GET /internal/admin/*,
// guarded by InternalSecretGuard — cross-tenant, the operator sees ALL rows).
// Server-side only: the internal secret must never reach the browser. Mirrors
// src/lib/telemetry.ts / src/lib/feedback.ts. Admin stays on the REAL API only
// (no demo source — the seed server has no admin surface).

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

// The four subscription tiers (PLAN_CONFIG in the API's credits.service).
export type PlanKey = 'trial' | 'starter' | 'team' | 'growth' | 'beta'

// One workspace a user belongs to, with their role in it (chips on /users).
//
// ⚠️ `isActive` — l'espace que cette personne voit RÉELLEMENT en ouvrant
// l'application. Il ne se déduit pas de la liste : quelqu'un qui appartient à
// son espace personnel ET à celui de son ESN a deux adhésions valides, et seul
// le sélecteur dit laquelle est active. C'est la question à laquelle la console
// ne savait pas répondre le 07/09/2026 (#1671-ter). Optionnel : pendant la
// fenêtre « console neuve sur API ancienne », le champ est absent et aucune
// ligne n'est marquée — jamais une ligne devinée.
type WorkspaceRef = { id: string; name: string; role: string; isActive?: boolean }

/**
 * L'état de la fiche ESN PARTAGÉE d'un espace (#1671-ter).
 *
 * Sans ligne canonique, aucun membre n'hérite de rien et chacun repasse tout le
 * questionnaire — c'est exactement ce qu'il fallait pouvoir constater sans
 * ouvrir la base de production.
 *
 * ⚠️ Aucune VALEUR de réponse ne transite : `filled`, jamais le contenu. Le
 * positionnement et les secteurs visés d'un client sont sa stratégie
 * commerciale.
 */
export type AdminWorkspaceEsnProfile = {
  canonical: boolean
  heldByUserId: string | null
  heldByEmail: string | null
  version: number | null
  updatedAt: string | null
  answers: { key: string; scope: 'company' | 'personal'; filled: boolean }[]
  companyFilled: number
  companyTotal: number
}

/** PLAN-GATE #4381 — de qui vient le plan affiché : l'abonnement du PROPRIÉTAIRE
 *  de l'espace actif, celui que lit le verrou de fonctionnalité. */
export type PlanScope = {
  workspaceId: string
  workspaceName: string
  ownerUserId: string
  ownerEmail: string | null
  isOwner: boolean
}

export type AdminUser = {
  userId: string
  email: string
  fullName: string
  /** Le plan EFFECTIF (celui de `planScope`), pas la ligne de la personne. */
  plan: PlanKey
  /** Absent d'une API antérieure au champ ; `null` = compte solo. */
  planScope?: PlanScope | null
  accountsUsed: number
  accountsLimit: number
  workspaces: WorkspaceRef[]
  createdAt: string
}

export type AdminWorkspace = {
  id: string
  name: string
  ownerUserId: string
  ownerEmail: string
  memberCount: number
  createdAt: string
}

type AdminWorkspaceMember = {
  userId: string
  email: string
  fullName: string
  role: string
  joinedAt: string
}

type AdminWorkspaceInvitation = {
  id: string
  email: string
  role: string
  status: string
  expiresAt: string
  createdAt: string
}

/**
 * L'activation du propriétaire d'un siège provisionné à la main — #2643.2.
 * `null` = aucune invitation n'a jamais été préparée pour cet espace (compte
 * réutilisé à la création). `sentAt: null` = préparée mais JAMAIS envoyée,
 * même quand `prepared` est vrai (#1665 règle 2, #2643.1) : rien ne part sans
 * le clic « Envoyer ».
 */
export type AdminOwnerInvitation = {
  email: string
  ownerFirstName: string | null
  esnName: string
  planLabel: string
  /** `false` = le lien n'a pas pu être engendré — `error` dit pourquoi. */
  prepared: boolean
  error: string | null
  expiresAt: string | null
  sentAt: string | null
  sentBy: string | null
  sendCount: number
  alertedAt: string | null
}

export type AdminWorkspaceDetail = {
  workspace: AdminWorkspace
  members: AdminWorkspaceMember[]
  invitations: AdminWorkspaceInvitation[]
  /** Optionnel : absent tant que l'API servie est antérieure à #1671-ter. La
   *  page dit alors « indisponible », jamais « aucune fiche ». */
  esnProfile?: AdminWorkspaceEsnProfile
  /** Optionnel : absent tant que l'API servie est antérieure à #2643.2. */
  ownerInvitation?: AdminOwnerInvitation | null
}

export type AdminOverview = {
  totalUsers: number
  totalWorkspaces: number
  totalAccounts: number
  plans: Record<PlanKey, number>
}

// Auth-side state, sourced by the API from Supabase's service-role admin API.
// Null on the detail payload when that lookup failed (shown as "indisponible").
type AdminUserAuthState = {
  confirmed: boolean
  banned: boolean
  bannedUntil: string | null
  lastSignInAt: string | null
  email: string | null
}

// #4423.1 — dernière trace d'usage connue (le plus récent entre connexion par mot de passe,
// action produit et message à Laura). `null` = aucune trace nulle part.
type AdminUserLastActivity = {
  at: string
  source: 'sign_in' | 'action' | 'laura'
}

// #4423.2 — ce que chaque compteur voisin compte (analyses lancées / terminées / suivies).
type AdminUserAccountsBreakdown = {
  total: number
  completed: number
  active?: number
  followed: number
  notCompletedNames: string[]
  notFollowedNames: string[]
  notCompletedByStatus?: Record<string, number>
  failedReasons?: { name: string; reason: string | null }[]
}

// Full per-user detail powering /users/[userId]: identity, plan+credits,
// workspaces, account count and the auth state.
export type AdminUserDetail = {
  userId: string
  email: string | null
  fullName: string | null
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
  createdAt: string
  plan: PlanKey
  accountsUsed: number
  accountsLimit: number
  enrichmentCredits: number
  workspaces: WorkspaceRef[]
  accountsCount: number
  auth: AdminUserAuthState | null
  lastActivity?: AdminUserLastActivity | null
  accountsBreakdown?: AdminUserAccountsBreakdown | null
}

// The editable plan catalogue (DB-backed `plan_definitions`), surfaced on /plans.
// `price` is in CENTS (starter 11900 = 119 €). `selfServe` = a user can checkout
// it (trial/beta are operator-only). Edited via PATCH /internal/admin/plans/:key.
export type AdminPlan = {
  key: string
  label: string
  price: number
  accountsLimit: number
  enrichmentCredits: number
  seats: number
  extraSeatPrice: number
  /** Les fonctions que le palier ouvre (gating par offre). Absent d'une API
   *  antérieure au champ : l'éditeur affiche alors des cases vides plutôt que
   *  de planter. */
  features?: string[]
  selfServe: boolean
  sortOrder: number
}

/* ────────────────────────── #1667.3 — volume et p95 par endpoint ──────────────────────────
 *
 * `app/api/page.tsx` était un testeur de requêtes ad hoc, sans aucun volume ni
 * p95. Plutôt qu'un nouveau chemin d'écriture côté `apps/api` (hors périmètre
 * de ce lot), CE fichier est le seul point de passage de tous les appels
 * admin (`adminGet`/`adminMutate`) : c'est ici qu'on les compte.
 *
 * ⚠️ AUCUNE DONNÉE DE REQUÊTE NOMINATIVE : ni la chaîne de requête (une
 * recherche tapée par un opérateur), ni un id littéral (un UUID ou un id
 * numérique devient `:id` AVANT d'être agrégé) — seulement des endpoints et
 * des volumes, exactement ce que l'issue demande.
 *
 * ⚠️ EN MÉMOIRE DU PROCESS Next.js — remis à zéro au redéploiement, non agrégé
 * entre instances. Même limite, documentée pour la même raison, que `GET
 * /metrics/cost` côté IA (voir agent_docs/env-reference.md) : un ordre de
 * grandeur lisible EN DIRECT, pas une comptabilité.
 */

type EndpointCallRecord = { method: string; endpoint: string; status: number; durationMs: number }

const MAX_RECORDED_CALLS = 500
let recordedCalls: EndpointCallRecord[] = []

/** Un UUID ou un id purement numérique devient `:id` — sinon deux comptes du
 *  même endpoint compteraient comme deux endpoints différents et le tableau
 *  grossirait sans fin, un id à la fois. */
function isDynamicSegment(segment: string): boolean {
  if (segment.length === 0) return false
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return true
  return /^\d+$/.test(segment)
}

/** Réduit un chemin à son ENDPOINT logique. La chaîne de requête est retirée
 *  ENTIÈREMENT — elle peut porter une recherche tapée par un opérateur. */
export function normalizeEndpointPath(path: string): string {
  const withoutQuery = path.split('?')[0] ?? path
  return withoutQuery
    .split('/')
    .map(segment => (isDynamicSegment(segment) ? ':id' : segment))
    .join('/')
}

/** Le p95 « nearest-rank » — LA MÊME formule que
 *  `apps/api/src/modules/analytics/observability-alerts.ts` (pas une seconde
 *  façon de calculer un centile, même si les deux paquets ne partagent aucun
 *  import : deux processus Node distincts, sans chemin de code commun). */
function p95(durationsMs: readonly number[]): number {
  const sorted = [...durationsMs].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
  return sorted[index] ?? 0
}

/** Appelé par `adminGet`/`adminMutate` après CHAQUE appel — jamais avant, pour
 *  que la durée mesurée soit celle réellement observée. Exporté pour les
 *  tests (`admin.test.ts`) : rien d'autre ne doit l'appeler. */
export function recordApiCallForTelemetry(method: string, path: string, status: number, durationMs: number): void {
  recordedCalls.push({ method, endpoint: normalizeEndpointPath(path), status, durationMs })
  if (recordedCalls.length > MAX_RECORDED_CALLS) recordedCalls = recordedCalls.slice(-MAX_RECORDED_CALLS)
}

/** Réservé aux tests — vide le tampon en mémoire entre deux cas. */
export function __resetApiTelemetry(): void {
  recordedCalls = []
}

export type EndpointTelemetry = {
  method: string
  endpoint: string
  count: number
  p95Ms: number
  errorCount: number
}

/** Le volume et le p95 PAR ENDPOINT, triés par volume décroissant — ce que
 *  `app/api/page.tsx` affiche désormais à côté du testeur de requêtes. */
export function apiTelemetrySnapshot(): EndpointTelemetry[] {
  const byKey = new Map<string, EndpointCallRecord[]>()
  for (const call of recordedCalls) {
    const key = `${call.method} ${call.endpoint}`
    const list = byKey.get(key)
    if (list) list.push(call)
    else byKey.set(key, [call])
  }
  return [...byKey.values()]
    .map(calls => ({
      method: calls[0]!.method,
      endpoint: calls[0]!.endpoint,
      count: calls.length,
      p95Ms: p95(calls.map(c => c.durationMs)),
      errorCount: calls.filter(c => c.status >= 400).length,
    }))
    .sort((a, b) => b.count - a.count)
}

async function adminGet<T>(path: string): Promise<T> {
  const startedAt = Date.now()
  const res = await fetch(`${REAL_BASE}/internal/admin${path}`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  recordApiCallForTelemetry('GET', path, res.status, Date.now() - startedAt)
  if (!res.ok) {
    throw new Error(`Admin endpoint ${path} returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  return adminGet<AdminOverview>('/overview')
}

type ListParams = { search?: string; limit?: number; offset?: number }

function listQuery({ search, limit = 50, offset = 0 }: ListParams): string {
  const qs = new URLSearchParams()
  if (search) qs.set('search', search)
  qs.set('limit', String(limit))
  qs.set('offset', String(offset))
  return qs.toString()
}

export async function fetchAdminUsers(params: ListParams = {}): Promise<{ users: AdminUser[]; total: number }> {
  return adminGet<{ users: AdminUser[]; total: number }>(`/users?${listQuery(params)}`)
}

/**
 * L'état d'authentification d'UN compte, tel que l'annuaire le lit (#1664).
 *
 * ⚠️ Pas d'adresse ici : l'annuaire la porte déjà par le profil, et une adresse
 * qui voyage deux fois est une adresse qu'on masque une fois sur deux.
 *
 * Local : seul `AdminUsersAuthStates` le nomme, et c'est lui que les appelants
 * manipulent (knip refuse un type exporté lu dans son seul fichier).
 */
type AdminUserAuthSnapshot = {
  userId: string
  confirmed: boolean
  banned: boolean
  bannedUntil: string | null
  /** `null` = ce compte ne s'est JAMAIS connecté. Un compte ABSENT de `states`
   *  n'est pas « jamais connecté » : il est inconnu. La distinction est tout le
   *  sujet de #1664, et elle vit dans `users.logic.ts`. */
  lastSignInAt: string | null
}

export type AdminUsersAuthStates = {
  /** `true` = tous les comptes ont été lus. `false` = magasin en panne ou
   *  plafond de pages atteint : ce qui manque est INCONNU, jamais « jamais ». */
  complete: boolean
  states: AdminUserAuthSnapshot[]
}

/**
 * Les états d'authentification de tous les comptes, en UNE lecture (#1664).
 *
 * L'annuaire (`/users`) ne porte que nos tables ; la dernière connexion et la
 * suspension vivent côté Supabase. C'était la raison écrite pour laquelle une
 * ligne de liste n'offrait pas « Suspendre » — « le lire coûterait un appel par
 * utilisateur ». Une page en coûte un pour deux cents comptes.
 */
export async function fetchAdminUsersAuthStates(): Promise<AdminUsersAuthStates> {
  return adminGet<AdminUsersAuthStates>('/users-auth-states')
}

export async function fetchAdminWorkspaces(
  params: ListParams = {},
): Promise<{ workspaces: AdminWorkspace[]; total: number }> {
  return adminGet<{ workspaces: AdminWorkspace[]; total: number }>(`/workspaces?${listQuery(params)}`)
}

export async function fetchAdminWorkspace(id: string): Promise<AdminWorkspaceDetail> {
  return adminGet<AdminWorkspaceDetail>(`/workspaces/${encodeURIComponent(id)}`)
}

// #4158.33 — l'aperçu d'un transfert de propriété : une LECTURE, l'API n'écrit rien.
export type OwnershipTransferPreview = {
  plan: { ok: true; movesSubscription: boolean } | { ok: false; code: string; message: string }
  workspaceName: string
  currentOwner: { userId: string; email: string | null }
  newOwner: { userId: string; email: string | null }
  candidates: { userId: string; email: string | null }[]
}

export async function fetchOwnershipTransferPreview(
  id: string,
  newOwnerUserId: string,
): Promise<OwnershipTransferPreview> {
  return adminGet<OwnershipTransferPreview>(
    `/workspaces/${encodeURIComponent(id)}/ownership-transfer/preview?newOwnerUserId=${encodeURIComponent(newOwnerUserId)}`,
  )
}

export async function fetchAdminUser(userId: string): Promise<AdminUserDetail> {
  return adminGet<AdminUserDetail>(`/users/${encodeURIComponent(userId)}`)
}

export async function fetchAdminPlans(): Promise<AdminPlan[]> {
  const data = await adminGet<{ plans: AdminPlan[] }>('/plans')
  return data.plans ?? []
}

// ── Ops observability (GET /internal/admin/usage + /health) ──────────────────
// Cost/usage aggregated per user + per workspace (the API sums accounts'
// api_cost_euros — Anthropic bills USD, the `euros` name is legacy) and the
// system-health rollup (queue depths + 24h failure rate + build id).

// Building blocks composed into the exported report types below — not exported
// (knip flags type exports consumed only in their own file).
type UsageByUser = {
  userId: string
  email: string | null
  fullName: string | null
  totalAnalyses: number
  /** Analyses dont le coût n'a jamais été estampillé — les totaux sont un PLANCHER. */
  unmeasuredAnalyses: number
  totalCost: number
  /** `null` = aucune analyse ne portait de coût. Une moyenne sur rien n'est pas 0. */
  avgCost: number | null
  last30dCost: number
}

type UsageByWorkspace = {
  workspaceId: string
  workspaceName: string | null
  totalAnalyses: number
  /** Analyses dont le coût n'a jamais été estampillé — les totaux sont un PLANCHER. */
  unmeasuredAnalyses: number
  totalCost: number
  /** `null` = aucune analyse ne portait de coût. Une moyenne sur rien n'est pas 0. */
  avgCost: number | null
  last30dCost: number
}

type UsageTotals = {
  totalAnalyses: number
  /** Analyses dont le coût n'a jamais été estampillé — les totaux sont un PLANCHER. */
  unmeasuredAnalyses: number
  totalCost: number
  /** `null` = aucune analyse ne portait de coût. Une moyenne sur rien n'est pas 0. */
  avgCost: number | null
  last30dCost: number
}

export type AdminUsageReport = {
  totals: UsageTotals
  byUser: UsageByUser[]
  byWorkspace: UsageByWorkspace[]
}

type QueueHealth = {
  name: string
  waiting: number | null
  active: number | null
  completed: number | null
  failed: number | null
  delayed: number | null
  paused: number | null
}

export type AdminSystemHealth = {
  status: 'healthy' | 'degraded'
  queues: QueueHealth[]
  failures: { windowHours: number; total: number; failed: number; failureRate: number | null }
  version: { commit: string; environment: string }
  uptimeSeconds: number
  timestamp: string
}

export async function fetchAdminUsage(): Promise<AdminUsageReport> {
  return adminGet<AdminUsageReport>('/usage')
}

export async function fetchAdminHealth(): Promise<AdminSystemHealth> {
  return adminGet<AdminSystemHealth>('/health')
}

// ── Migrations (GET /internal/admin/migrations) — #2445.11 ──────────────────
// Lecture seule : ce que CETTE base a réellement exécuté (`_migrations`)
// contre ce que le build de l'API connaît. Aucune preview de lignes, aucun
// rollback ni backfill ici — ces gestes restent en CLI, avec droit + audit.

type AppliedMigration = { name: string; appliedAt: string | null }

export type AdminMigrationsReport = {
  total: number
  applied: AppliedMigration[]
  pending: string[]
}

export async function fetchAdminMigrations(): Promise<AdminMigrationsReport> {
  return adminGet<AdminMigrationsReport>('/migrations')
}

// ── Politique de routage modèle (GET /internal/admin/model-routing) — #2445.2
// (épopée #2766). Lecture seule : le réglage vit sur l'IA (GA-26), cet
// endpoint le RESSERT tel quel. `available: false` = l'IA n'a pas répondu —
// jamais une politique inventée pour combler le trou.

export type AdminModelRoutingEntry = {
  task: string
  provider: string
  model: string | null
  overridden: boolean
  inheritsFrom: string | null
  // #2440.82 — changement de fournisseur/modèle : les évaluations sont-elles rejouées ?
  evalStatus: 'reference' | 'evaluated' | 'to_evaluate'
  evalReplayCommand: string | null
}

export type AdminModelRoutingReport = {
  available: boolean
  routes: AdminModelRoutingEntry[]
}

export async function fetchAdminModelRouting(): Promise<AdminModelRoutingReport> {
  return adminGet<AdminModelRoutingReport>('/model-routing')
}

// ── Registre de prompts (GET /internal/admin/prompt-registry) — #2445.1
// (épopée #2766). Lecture seule : le registre vit sur l'IA (GA-26), cet
// endpoint le RESSERT tel quel. `available: false` = l'IA n'a pas répondu —
// jamais une liste inventée pour combler le trou.

type AdminPromptRegistryEntry = {
  name: string
  version: string | null
}

export type AdminPromptRegistryReport = {
  available: boolean
  prompts: AdminPromptRegistryEntry[]
}

export async function fetchAdminPromptRegistry(): Promise<AdminPromptRegistryReport> {
  return adminGet<AdminPromptRegistryReport>('/prompt-registry')
}

// ── Diff d'un prompt entre deux refs git + commande de rollback (GET
// /internal/admin/prompt-registry/:name/diff) — #2445.1 (épopée #2766). Le
// diff est calculé côté IA sur le fichier golden committé (`git diff`), la
// commande de rollback est RENDUE, jamais exécutée — un rollback de prompt
// reste un commit qu'un humain fait. `available: false` = l'IA n'a pas
// répondu — jamais un diff inventé.

export type AdminPromptRegistryDiffReport = {
  available: boolean
  diff: string
  rollbackCommand: string[]
}

export async function fetchAdminPromptRegistryDiff(
  name: string,
  refA: string,
  refB: string,
): Promise<AdminPromptRegistryDiffReport> {
  const qs = new URLSearchParams({ refA, refB })
  return adminGet<AdminPromptRegistryDiffReport>(`/prompt-registry/${encodeURIComponent(name)}/diff?${qs}`)
}

// ── Matrice des droits par outil (GET /internal/admin/rights-matrix) — #2445.4
// (épopée #2766). Lecture seule : le classement vit sur l'IA
// (`app/services/tool_permissions.py`, déménagé hors de `tests/` ce lot,
// GA-26), cet endpoint le RESSERT tel quel. `available: false` = l'IA n'a pas
// répondu — jamais une matrice inventée pour combler le trou.

export type AdminRightsMatrixEntry = {
  tool: string
  permission: string
}

export type AdminRightsMatrixReport = {
  available: boolean
  tools: AdminRightsMatrixEntry[]
}

export async function fetchAdminRightsMatrix(): Promise<AdminRightsMatrixReport> {
  return adminGet<AdminRightsMatrixReport>('/rights-matrix')
}

// ── Route migration registry + NO-GO/GO (GET /internal/admin/route-migration) — #2958 ──
// route-migration-registry.ts et route-migration-go-no-go.ts (#2154.3/.31/.32)
// existaient déjà, testés, sans aucun appelant. Lecture seule : le registre
// des quatorze routes nommées et le verdict GO/NO-GO, tels que l'API les
// calcule — le back-office n'en garde aucune copie.

type RouteMigrationEntry = {
  key: string
  sourceIssue: string
  label: string
  currentRoute: string
  targetStatus: 'redirected' | 'removed' | 'never_renamed' | 'unverifiable_shallow_clone'
  newDestination: string | null
  preservedParams: string[]
  canonicalObject: string | null
  holderFile: string | null
  gap: string
}

type NoGoCondition = {
  key: string
  label: string
  status: 'not_yet_evaluable' | 'blocked' | 'clear'
  evidence: string
}

type GoCondition = {
  key: string
  label: string
  status: 'not_met' | 'met' | 'unknown'
  evidence: string
  humanOnly: boolean
}

// #2958 — rollback (#2154.7), coexistence (#2154.8), non-régression (#2154.9).
// Même patron que les trois types au-dessus : une COPIE de la forme du JSON
// renvoyé par l'API, pas un import de `@bellum/contracts` — ce back-office ne
// garde aucune copie DE LA DONNÉE, seulement de sa forme de transport.

type RouteMigrationRollbackEntry = {
  key: string
  sourceIssue: string
  stageReached: string | null
  evidence: string
  rollbackHolderFile: string | null
  rollbackAction: string
  canRollback: boolean
}

type RouteMigrationCoexistenceEntry = {
  key: string
  sourceIssue: string
  mode: 'vue_partagee' | 'redirection_pure' | 'non_verifiable'
  canonicalDataSource: string | null
  evidence: string
}

type NonRegressionCheck = {
  dimension: string
  status: 'verified' | 'gap'
  evidence: string
  file: string | null
}

type NonRegressionCapacity = {
  key: string
  sourceIssue: string
  label: string
  routeMigrationKey: string
  checks: NonRegressionCheck[]
}

// #2958.72-.93 — neuf métriques analytics, une par émetteur du traceur
// produit, agrégées par route/écran (jamais par personne).
type RouteMigrationMetric = {
  key: string
  sourceIssue: string
  eventName: string
  label: string
  aggregation: 'route_or_screen'
  status: 'instrumented' | 'gap'
  provenOnDestinations: string[]
  evidence: string
  file: string | null
}

export type AdminRouteMigrationReport = {
  registry: {
    total: number
    redirectedCount: number
    entries: RouteMigrationEntry[]
  }
  goNoGo: {
    canGo: boolean
    noGo: NoGoCondition[]
    go: GoCondition[]
  }
  /** #2958.94-.112 — vocabulaire distinct de #2154.31/.32, jamais fusionné. */
  goNoGo2208: {
    canGo: boolean
    noGo: NoGoCondition[]
    go: GoCondition[]
  }
  rollback: {
    rollbackableCount: number
    entries: RouteMigrationRollbackEntry[]
  }
  coexistence: {
    sharedViewCount: number
    entries: RouteMigrationCoexistenceEntry[]
  }
  nonRegression: {
    capacities: NonRegressionCapacity[]
  }
  metrics: {
    instrumentedCount: number
    entries: RouteMigrationMetric[]
  }
}

export async function fetchAdminRouteMigration(): Promise<AdminRouteMigrationReport> {
  return adminGet<AdminRouteMigrationReport>('/route-migration')
}

// Server-side proxy for admin MUTATIONS. Returns the upstream status + parsed
// body so DM route handlers can forward both. The internal secret never leaves
// the server (route handlers + this module are server-side only).
export async function adminMutate(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<{ status: number; ok: boolean; data: unknown }> {
  if (!REAL_SECRET) {
    return {
      status: 500,
      ok: false,
      data: { error: 'INTERNAL_API_SECRET non configuré côté dashboard — impossible d’appeler l’API.' },
    }
  }
  const hasBody = body !== undefined
  const startedAt = Date.now()
  const res = await fetch(`${REAL_BASE}/internal/admin${path}`, {
    method,
    headers: {
      'x-internal-secret': REAL_SECRET,
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
    },
    ...(hasBody ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  })
  recordApiCallForTelemetry(method, path, res.status, Date.now() - startedAt)
  const text = await res.text()
  let data: unknown = text
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    /* keep raw text for the error message */
  }
  return { status: res.status, ok: res.ok, data }
}

/** How often an invoice-billed client is billed. */
type ManualBillingPeriod = 'monthly' | 'quarterly' | 'yearly' | 'one_off'

/** Une facture réellement émise, telle que la comptabilité l'a numérotée. */
export type ManualInvoice = {
  id: string
  reference: string
  amountCents: number
  currency: string
  periodStart: string
  periodEnd: string
  issuedOn: string | null
  paymentStatus: 'unpaid' | 'paid'
  /** `null` peut vouloir dire « encaissée, date inconnue » — lire le statut. */
  paidOn: string | null
  notes: string | null
}

type BillingAlertKind = 'invoice_missing' | 'invoice_unpaid' | 'commitment_ended_unrenewed' | 'commitment_ending_soon'

type BillingSeverity = 'ok' | 'info' | 'warning' | 'danger'

export type BillingAlert = {
  kind: BillingAlertKind
  severity: Exclude<BillingSeverity, 'ok'>
  days: number
  window: { start: string; end: string } | null
  reference: string | null
}

/**
 * L'état dérivé d'un contrat : ce qui est en retard, et depuis combien de temps.
 * Calculé PAR L'API (`billingHealth`) — le back-office ne le recalcule pas, sans
 * quoi l'écran et l'alerte quotidienne raconteraient deux histoires du même
 * client.
 */
export type BillingHealth = {
  /** `null` = aucun engagement enregistré. Ne JAMAIS afficher « 0 mois ». */
  commitmentEnd: string | null
  currentWindow: { start: string; end: string } | null
  windowsDue: number
  windowsInvoiced: number
  windowsMissing: Array<{ start: string; end: string }>
  alerts: BillingAlert[]
  severity: BillingSeverity
}

/**
 * One invoice-billed (sales-led) client: what was sold, what has actually been
 * invoiced since, and what is late. Le produit n'émet toujours aucun document
 * et ne relance personne — il sait seulement DIRE ce qui manque.
 */
export type ManualClient = {
  workspaceId: string
  workspaceName: string
  ownerEmail: string | null
  plan: string | null
  billingMode: string | null
  amountCents: number
  currency: string
  period: ManualBillingPeriod
  startDate: string
  commitmentMonths: number | null
  billedToName: string | null
  billedToKind: 'person' | 'company' | null
  billingEmail: string | null
  billingPhone: string | null
  reference: string | null
  notes: string | null
  invoices: ManualInvoice[]
  health: BillingHealth
}

export async function fetchManualClients(): Promise<ManualClient[]> {
  return adminGet<ManualClient[]>('/clients/manual')
}

/** One feature flag as Reflag evaluates it for the requested context. */
type AdminFlag = {
  key: string
  enabled: boolean
}

/**
 * Feature flags evaluated for an OPTIONAL user / workspace. `configured` is
 * false when the API has no `REFLAG_SECRET_KEY` — which is what distinguishes
 * "no flags exist" from "Reflag isn't connected", two states that look
 * identical from an empty list.
 */
export async function fetchAdminFlags(params: { userId?: string; workspaceId?: string } = {}): Promise<{
  configured: boolean
  flags: AdminFlag[]
}> {
  const query = new URLSearchParams()
  if (params.userId) query.set('userId', params.userId)
  if (params.workspaceId) query.set('workspaceId', params.workspaceId)
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return adminGet<{ configured: boolean; flags: AdminFlag[] }>(`/flags${suffix}`)
}

/** Une entrée du changelog produit, telle que le catalogue partagé la résout. */
type ChangelogEntryRow = {
  id: string
  date: string
  title: string
  items: string[]
}

/**
 * Où en sont les lecteurs de la Newsletter Changelog.
 *
 * Les six familles s'ADDITIONNENT jusqu'à `readers` — un lecteur est dans une
 * et une seule, c'est ce qui rend l'écran vérifiable d'un coup d'oeil.
 * `upToDateShare` vaut `null` sans aucun lecteur : « non mesuré » n'est ni
 * « 0 % » ni « 100 % ». `suppressionEvaluated` est toujours `false` et l'écran
 * le DIT — sinon `behind` se lirait comme « le nombre d'e-mails qui partiront ».
 */
type ChangelogDelivery = {
  latestEntryId: string
  readers: number
  upToDate: number
  behind: number
  neverServed: number
  markerRetired: number
  optedOut: number
  noEmail: number
  upToDateShare: number | null
  markers: {
    entryId: string | null
    date: string | null
    title: string | null
    readers: number
    pendingEntries: number
  }[]
  suppressionEvaluated: false
  computedAt: string
}

type AdminChangelogReport = {
  entries: ChangelogEntryRow[]
  delivery: ChangelogDelivery
}

/**
 * Le changelog produit + son état de diffusion (#1704 — « suivre les changelog
 * sur le dashboard manager », Louis, 06/09/2026).
 *
 * Le catalogue vient de l'API, qui le résout depuis `@bellum/contracts` — la
 * MÊME source que l'e-mail bimensuel et que le panneau « Nouveautés » de la
 * SPA. Le back-office n'en garde aucune copie : un miroir aurait divergé au
 * premier ajout d'entrée, et personne ne l'aurait vu.
 */
export async function fetchAdminChangelog(): Promise<AdminChangelogReport> {
  return adminGet<AdminChangelogReport>('/changelog')
}

// ── Gouvernance du corpus méthode (GET /internal/admin/method-corpus-governance)
// — #3274.5 (épopée #3274). Lecture seule : la gouvernance vit sur
// `packages/contracts/src/schemas/method-corpus.ts` (GA-26), cet endpoint la
// RESSERT telle quelle. `wiredAtRuntime: null` = l'IA n'a pas répondu au
// croisement — jamais un booléen deviné.

type AdminMethodCorpusGovernanceEntry = {
  ruleId: string
  title: string
  category: string
  owner: string
  enabled: boolean
  disabledReason: string | null
  featureFlagKey: string | null
  comparisonToProductRules: string
  impactMetricKey: string | null
  introducedOrRevisedInVersion: string
  wiredAtRuntime: boolean | null
}

type AdminMethodCorpusChangeLogEntry = {
  version: string
  releasedAt: string
  summary: string
  ruleIds: string[]
  comparisonNote: string | null
}

type AdminMethodCorpusGovernanceReport = {
  corpusVersion: string
  releasedAt: string
  runtimeCrossCheckAvailable: boolean
  rules: AdminMethodCorpusGovernanceEntry[]
  changeLog: AdminMethodCorpusChangeLogEntry[]
}

export async function fetchAdminMethodCorpusGovernance(): Promise<AdminMethodCorpusGovernanceReport> {
  return adminGet<AdminMethodCorpusGovernanceReport>('/method-corpus-governance')
}
