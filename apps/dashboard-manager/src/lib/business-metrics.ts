// Client des chiffres de BELLUM (GET/POST/PUT /internal/admin/business-metrics,
// gardé par InternalSecretGuard). Appelé CÔTÉ SERVEUR uniquement — le secret
// interne ne doit jamais atteindre le navigateur. Même forme que
// src/lib/telemetry.ts et src/lib/admin.ts.
//
// ⚠️ AUCUNE ÉCRITURE VERS LA FACTURATION ICI. On lit une mesure, on saisit une
// trésorerie. Rien dans ce fichier ne change un prix, un abonnement, une facture
// ni un crédit — l'API n'expose pas ces chemins depuis ce contrôleur (#1645).

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

/**
 * Un mois FIGÉ de la série.
 *
 * ⚠️ Les mouvements sont `number | null` et le restent jusqu'à l'écran : le
 * premier mois de la série n'a pas de mois précédent, et « — » n'est pas
 * « 0 % ». Un `?? 0` ici annulerait tout le travail fait côté API.
 */
export type BusinessMonth = {
  month: string
  mrrStartCents: number | null
  mrrNewCents: number | null
  mrrExpansionCents: number | null
  mrrContractionCents: number | null
  mrrChurnedCents: number | null
  mrrEndCents: number
  customersStart: number | null
  customersNew: number | null
  customersChurned: number | null
  customersEnd: number
  contractedRevenueCents: number
  contractedCustomers: number
  oneOffCents: number
  oneOffCustomers: number
  computedAt: string
}

/** La position du MOMENT — jamais figée, jamais confondue avec un instantané. */
export type BusinessCurrent = {
  mrrCents: number
  customers: number
  contractedRevenueCents: number
  contractedCustomers: number
  oneOffCents: number
  oneOffCustomers: number
}

export type TreasuryMonthView = {
  month: string
  bankBalanceCents: number | null
  fixedExpensesCents: number | null
  variableExpensesCents: number | null
  collectedCents: number | null
  burnCents: number | null
  updatedAt: string | null
  updatedBy: string | null
}

/** Pourquoi le runway n'est pas un nombre. Chacun a sa phrase à l'écran. */
export type RunwayUnavailable = 'not_enough_months' | 'no_balance' | 'not_burning'

export type TreasuryView = {
  months: TreasuryMonthView[]
  latestMonth: string | null
  averageBurn:
    | { measured: true; cents: number; monthsUsed: number }
    | { measured: false; reason: 'not_enough_months' }
    | null
  runway:
    | { measured: true; months: number; averageBurnCents: number }
    | { measured: false; reason: RunwayUnavailable }
    | null
}

export type BusinessMetricsOverview = {
  series: BusinessMonth[]
  current: BusinessCurrent
  treasury: TreasuryView
}

/**
 * Une ligne du tableau des mouvements PAR CLIENT du mois (#1646.6).
 *
 * `client` est `null` quand le sujet facturé n'a ni espace ni profil connu —
 * jamais un identifiant technique brut à la place d'un nom.
 */
export type MonthlyClientMovement = {
  client: string | null
  nature: 'nouveau' | 'expansion' | 'contraction' | 'attrition'
  montantCents: number
  month: string
}

/** Ce qu'on écrit pour un mois. `null` EFFACE, un champ absent ne bouge pas. */
export type TreasuryInput = {
  bankBalanceCents?: number | null
  fixedExpensesCents?: number | null
  variableExpensesCents?: number | null
  collectedCents?: number | null
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${REAL_BASE}/internal/admin/business-metrics${path}`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`business-metrics${path} a répondu ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

export async function fetchBusinessMetrics(): Promise<BusinessMetricsOverview> {
  return get<BusinessMetricsOverview>('')
}

export async function fetchTreasury(): Promise<TreasuryView> {
  return get<TreasuryView>('/treasury')
}

/** Le tableau des mouvements par client d'un mois FIGÉ (#1646.6). `month` en
 *  AAAA-MM — l'API refuse tout autre format avant même de lire. */
export async function fetchMonthlyMovements(month: string): Promise<MonthlyClientMovement[]> {
  return get<MonthlyClientMovement[]>(`/movements/${encodeURIComponent(month)}`)
}

/**
 * Écrit un mois de trésorerie, ou fige un instantané.
 *
 * `operator` est l'adresse RELUE par la porte à cette requête (jamais celle du
 * cookie, jamais un champ du corps). Absente, la ligne portera `null` : la
 * couche d'identité peut être au repos, et un `'inconnu'` ferait d'une lacune
 * un auteur.
 */
export async function businessMetricsMutate(
  method: 'POST' | 'PUT',
  path: string,
  body: unknown,
  operator: string | null,
): Promise<{ status: number; ok: boolean; data: unknown }> {
  if (!REAL_SECRET) {
    return {
      status: 500,
      ok: false,
      data: { error: 'INTERNAL_API_SECRET non configuré côté console — impossible d’appeler l’API.' },
    }
  }
  const res = await fetch(`${REAL_BASE}/internal/admin/business-metrics${path}`, {
    method,
    headers: {
      'x-internal-secret': REAL_SECRET,
      'content-type': 'application/json',
      ...(operator ? { 'x-operator-email': operator } : {}),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const text = await res.text()
  let data: unknown = text
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    // La réponse n'est pas du JSON : on rend le texte brut plutôt qu'un objet
    // vide, sinon l'écran dirait « échec » sans jamais dire lequel.
  }
  return { status: res.status, ok: res.ok, data }
}
