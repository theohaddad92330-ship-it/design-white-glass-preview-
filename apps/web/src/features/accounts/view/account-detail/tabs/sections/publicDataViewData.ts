import {
  hiringScopeVerdict,
  type AnalysisApolloOrgEnrichment,
  type SalesProfileForRelevance,
  type SecFinancialFact,
  type TechnologyEntry,
  type UsSecFinancials,
} from '@bellum/contracts'

/**
 * Une ligne de la stack technique : le nom, et — quand l'ANALYSE l'a relevé —
 * ce à quoi la techno sert chez ce compte et où elle en est.
 *
 * Non exporté, comme {@link SecFinancialRow} juste en dessous : les appelants
 * le lisent STRUCTURELLEMENT sur le type de retour de {@link mergeTechStack}.
 * Un type exporté et consommé nulle part ailleurs est refusé par knip
 * (`pnpm lint:exports:types`).
 */
type TechStackRow = { name: string; usage: string | null; maturity: string | null }

/**
 * Les TROIS sources de la stack technique, fusionnées, dédupliquées sans tenir
 * compte de la casse, bornées.
 *
 * ⚠️ `analysed` — `raw_analysis.technology_stack[]` — était la source
 * MANQUANTE : la carte ne lisait que la détection sur site et le réseau
 * professionnel, si bien qu'un compte dont l'analyse avait relevé la stack mais
 * dont la détection n'avait rien rendu n'affichait AUCUNE carte technique. Elle
 * est aussi la seule à porter l'usage et la maturité, que rien n'affichait —
 * « Cloud hybride » est un mot, « Cloud hybride, modernisation des infra, en
 * production » est une accroche.
 *
 * Elle passe donc EN PREMIER : quand un nom nu détecté sur le site double une
 * entrée de l'analyse, c'est l'entrée riche qui gagne. L'inverse rendrait la
 * matière invisible au hasard de l'ordre de détection.
 *
 * Un nom nu ne se voit JAMAIS attribuer un usage ou une maturité : ces deux
 * champs valent `null`, et l'écran dit l'absence au lieu de l'inventer.
 */
export function mergeTechStack(
  detected: string[] | undefined,
  apollo: AnalysisApolloOrgEnrichment['technologies'] | undefined,
  analysed?: TechnologyEntry[] | undefined,
  limit = 24,
): TechStackRow[] {
  const seen = new Set<string>()
  const out: TechStackRow[] = []

  const push = (row: TechStackRow) => {
    const key = row.name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(row)
  }

  for (const entry of analysed ?? []) {
    if (out.length >= limit) return out
    const name = typeof entry?.name === 'string' ? entry.name.trim() : ''
    if (!name) continue
    push({ name, usage: readText(entry.usage), maturity: readText(entry.maturity) })
  }

  for (const name of [...(detected ?? []), ...(apollo ?? [])]) {
    if (out.length >= limit) return out
    if (typeof name !== 'string') continue
    const trimmed = name.trim()
    if (!trimmed) continue
    push({ name: trimmed, usage: null, maturity: null })
  }

  return out
}

/** `usage` et `maturity` acceptent l'enum ET une chaîne libre : on ne rend que
 *  ce qui est lisible, jamais un objet ni une chaîne vide. */
function readText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Compact euro amount (e.g. "1,5 M€"). ``null`` for non-finite / missing. */
export function formatEuros(value: number | null | undefined, locale: string): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

/** Localised integer, or ``null`` when absent/non-finite. */
export function formatCount(value: number | null | undefined, locale: string): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB').format(value)
}

/** Percentage share (e.g. "55 %"), or ``null``. Values are 0-100 from the registry. */
export function formatPercent(value: number | null | undefined, locale: string): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return (
    new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      maximumFractionDigits: 1,
    }).format(value) + (locale === 'fr' ? ' %' : '%')
  )
}

/** Compact USD amount (e.g. "5,5 Md $" / "$5.5B") for SEC/EDGAR figures — the US
 *  10-K facts are reported in USD, not EUR. ``null`` for non-finite / missing. */
export function formatUsd(value: number | null | undefined, locale: string): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

/** One merged SEC annual row: revenue + net income for a fiscal-period end, plus
 *  the 10-K filing date. In-file only (knip) — consumers read it structurally
 *  off ``buildSecFinancialRows``' inferred return type. */
type SecFinancialRow = {
  end: string
  revenue: number | null
  netIncome: number | null
  filed: string | null
}

/** Merge the SEC annual revenue + net-income series by fiscal-period end into
 *  display rows (recent-first, bounded). Present-only: a row exists as soon as
 *  either metric is present for that period; absent series contribute nothing. */
export function buildSecFinancialRows(data: UsSecFinancials | null | undefined, limit = 4): SecFinancialRow[] {
  const byEnd = new Map<string, SecFinancialRow>()
  const ingest = (facts: SecFinancialFact[] | undefined, key: 'revenue' | 'netIncome'): void => {
    for (const fact of facts ?? []) {
      const end = typeof fact?.end === 'string' ? fact.end.trim() : ''
      if (!end) continue
      const val = typeof fact.val === 'number' && Number.isFinite(fact.val) ? fact.val : null
      const filed = typeof fact.filed === 'string' && fact.filed.trim().length > 0 ? fact.filed.trim() : null
      const row = byEnd.get(end) ?? { end, revenue: null, netIncome: null, filed: null }
      row[key] = val
      if (!row.filed && filed) row.filed = filed
      byEnd.set(end, row)
    }
  }
  ingest(data?.revenues, 'revenue')
  ingest(data?.net_income, 'netIncome')
  return [...byEnd.values()]
    .filter(row => row.revenue !== null || row.netIncome !== null)
    .sort((a, b) => b.end.localeCompare(a.end))
    .slice(0, limit)
}

/* ─── Classement des dirigeants du registre (#1086) ─────────────────────────── */

/** Non exporté : les appelants passent des littéraux, structurellement
 *  compatibles. Un type exporté et consommé nulle part ailleurs est refusé par
 *  knip (`pnpm lint:exports:types`). */
type RankedOfficer = { name: string; role: string | null }

/**
 * Rangs de lecture d'un mandat, du plus utile au commercial au moins utile.
 * L'écart entre 0 et 3 est tout le retour #1086 : « les administrateurs des
 * mutuelles on s'en fiche un peu nan ? ».
 */
const OFFICER_TIER = { it: 0, management: 1, unknown: 2, governance: 3 } as const

/** Gouvernance : le mandat surveille, il ne dirige pas au quotidien. Testé
 *  AVANT la direction générale, parce que « Président du conseil » contient
 *  « Président ». */
const GOVERNANCE_PATTERNS = [
  /\bconseil\b/,
  /\badministrateur/,
  /\bcenseur\b/,
  /\bcommissaire aux comptes\b/,
  /\bsurveillance\b/,
  /\bassocie\b/,
]

/** Direction opérationnelle. Sur une SAS le président EST l'opérationnel ; le
 *  filtre gouvernance ci-dessus a déjà retiré les « président du conseil ». */
const MANAGEMENT_PATTERNS = [
  /\bdirecteur\b/,
  /\bdirectrice\b/,
  /\bdirection\b/,
  /\bgerant/,
  /\bpresident/,
  /\bdg\b/,
  /\bpdg\b/,
  /\bdirecteur general\b/,
]

/** Fonctions informatiques et techniques — ce que le testeur demande à voir
 *  « au moins ». Volontairement court : un sigle mal reconnu vaut mieux qu'un
 *  faux positif, puisqu'un rôle non reconnu reste visible au rang du milieu. */
const IT_PATTERNS = [
  /\bsystemes? d'information\b/,
  /\bsysteme d information\b/,
  /\binformatique\b/,
  /\bnumerique\b/,
  /\bdigital\b/,
  /\btechnique\b/,
  /\btechnologie/,
  /\bdsi\b/,
  /\bcto\b/,
  /\bcio\b/,
  /\brssi\b/,
  /\bciso\b/,
]

/** Minuscules sans accents ni ponctuation : « Directrice Générale » et
 *  « DIRECTEUR GENERAL » doivent tomber dans la même case. */
function normalizeRole(role: string | null): string {
  if (!role) return ''
  return role
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function officerTier(role: string | null): number {
  const normalized = normalizeRole(role)
  if (!normalized) return OFFICER_TIER.unknown
  if (IT_PATTERNS.some(pattern => pattern.test(normalized))) return OFFICER_TIER.it
  if (GOVERNANCE_PATTERNS.some(pattern => pattern.test(normalized))) return OFFICER_TIER.governance
  if (MANAGEMENT_PATTERNS.some(pattern => pattern.test(normalized))) return OFFICER_TIER.management
  return OFFICER_TIER.unknown
}

/**
 * Classe les mandataires du registre par utilité commerciale, PUIS coupe.
 *
 * #1086. L'ordre du registre est administratif : sur une mutuelle il commence
 * par trente administrateurs, et la carte s'arrêtait à huit — un directeur des
 * systèmes d'information plus bas dans la liste n'atteignait donc jamais
 * l'écran. Classer avant de couper est tout le correctif ; le tri n'invente
 * rien, il lit le LIBELLÉ que le registre publie.
 *
 * ⚠️ Ce qui n'est pas reconnu n'est pas relégué : un rôle absent ou inhabituel
 * se range au MILIEU, devant la gouvernance. Reléguer sur une ignorance ferait
 * disparaître exactement les fonctions qu'aucune liste de mots ne couvre.
 *
 * `hiddenCount` existe pour que la coupe se VOIE : « 8 sur 34 » se lit, « 8 »
 * laisse croire qu'il n'y en a que huit.
 */
export function rankOfficers(
  officers: RankedOfficer[],
  limit = 8,
): {
  officers: RankedOfficer[]
  hiddenCount: number
} {
  const seen = new Set<string>()
  const unique: RankedOfficer[] = []
  for (const officer of officers) {
    const name = officer.name.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push({ name, role: officer.role })
  }
  // `sort` est stable en JS moderne : à rang égal, l'ordre du registre tient.
  const ranked = [...unique].sort((left, right) => officerTier(left.role) - officerTier(right.role))
  return { officers: ranked.slice(0, limit), hiddenCount: Math.max(ranked.length - limit, 0) }
}

/**
 * #4396.1 — les offres du métier de l'ESN d'un côté, les autres de l'autre : le MÊME verdict que les signaux de
 * Découvrir (`hiringScopeVerdict`, GA-26). Rien n'est effacé — `offTrade` se nomme « hors métier » à l'écran.
 * Profil pas encore lu : seul un poste que nulle ESN ne place sort, le reste n'est pas deviné hors métier.
 */
export function splitJobsByTrade<T extends { title?: string | null }>(
  jobs: readonly T[],
  profile: SalesProfileForRelevance | undefined,
): { inTrade: T[]; offTrade: T[] } {
  const inTrade: T[] = []
  const offTrade: T[] = []
  for (const job of jobs) {
    const title = job.title ?? ''
    ;(hiringScopeVerdict(title, profile).keep ? inTrade : offTrade).push(job)
  }
  return { inTrade, offTrade }
}
