import type { AccountAnalysis } from '@bellum/contracts'
import { signalDateMs } from '@bellum/contracts'
import type { ConfidenceTier } from '../evaluation/evaluationViewData'

/**
 * « Sources et confiance » de la vue d'ensemble (Théo TF1 p.14).
 *
 * PRINCIPE p14 : « Une source n'est pas un bloc de navigation. C'est une
 * propriété de chaque fait. Apollo, Pappers, Brave ou France Travail doivent
 * rester traçables sans polluer la lecture commerciale. » Ce module dérive, de
 * façon PURE et déterministe, la provenance réelle d'un dossier :
 *   - la fraîcheur globale (dernière analyse) ;
 *   - la confiance du dossier (déjà calculée ailleurs, threadée ici) ;
 *   - la liste des sources qui ont RÉELLEMENT nourri le dossier.
 *
 * RÈGLE ABSOLUE — jamais de donnée inventée : une source n'apparaît que si son
 * bloc de faits est présent (`present-only`), une source de signal sans nom
 * tombe dans un seau « source inconnue » (jamais un fournisseur plausible
 * fabriqué), et une date absente reste absente (jamais dérivée d'autre chose).
 */

/** Fournisseurs canoniques — même vocabulaire que les badges déjà affichés.
 *  Non exporté : sa forme voyage via `ProvenanceSource`, les consommateurs
 *  comparent par littéral de chaîne (pas d'import de type dédié → knip clean). */
type ProviderKey = 'apollo' | 'pappers' | 'sec' | 'publicMarkets' | 'employment' | 'github'

/** Ce qu'une source a nourri sur la vue d'ensemble (blocs réellement rendus). */
type FeedKey = 'firmographics' | 'financials' | 'leadership' | 'tenders' | 'jobs' | 'github' | 'signals'

/** Une source tracée : soit un fournisseur canonique, soit une source de signal
 *  brute (nom libre écrit par l'IA), soit l'inconnue explicite. */
export type ProvenanceSource = {
  /** Clé stable (React key + tests). Canonique = providerKey ; brute = `raw:<nom>` ; inconnue = `unknown`. */
  key: string
  providerKey: ProviderKey | null
  /** Libellé littéral d'une source de signal non canonique (ex. « Brave News »). */
  rawLabel: string | null
  feeds: FeedKey[]
  /** Date-ish la plus récente connue pour cette source, ou `null` (= date inconnue). */
  latestDate: string | null
}

export type AccountProvenance = {
  lastAnalyzedAt: string | null
  ageDays: number | null
  reliability: number | null
  tier: ConfidenceTier | null
  sources: ProvenanceSource[]
}

type BuildParams = {
  lastAnalyzedAt: string | null
  reliability: number | null
  tier: ConfidenceTier | null
  analysis: AccountAnalysis
  apolloEnrichment?: Record<string, unknown> | null
  nowMs?: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Ordre d'affichage des fournisseurs canoniques (les plus factuels d'abord). */
const PROVIDER_ORDER: ProviderKey[] = ['apollo', 'pappers', 'sec', 'publicMarkets', 'employment', 'github']

/** Un accumulateur mutable par fournisseur canonique pendant la dérivation. */
type ProviderAcc = { feeds: Set<FeedKey>; dates: string[] }

export function buildAccountProvenance(params: BuildParams): AccountProvenance {
  const { lastAnalyzedAt, reliability, tier, analysis } = params
  const nowMs = params.nowMs ?? Date.now()
  const apollo = params.apolloEnrichment ?? null

  const providers = new Map<ProviderKey, ProviderAcc>()
  const rawSources = new Map<string, { label: string | null; dates: string[] }>()

  const addFeed = (key: ProviderKey, feed: FeedKey, ...dates: Array<string | null | undefined>) => {
    const acc = providers.get(key) ?? { feeds: new Set<FeedKey>(), dates: [] }
    acc.feeds.add(feed)
    for (const d of dates) if (typeof d === 'string' && d.trim().length > 0) acc.dates.push(d)
    providers.set(key, acc)
  }

  // ── Blocs structurés (present-only) ────────────────────────────────────────
  if (apollo && Object.keys(apollo).length > 0) addFeed('apollo', 'firmographics')

  if (
    (analysis.financials_history?.length ?? 0) > 0 ||
    Boolean(analysis.legal_form) ||
    typeof analysis.capital === 'number' ||
    Boolean(analysis.creation_date) ||
    Boolean(analysis.pappers_url)
  ) {
    const years = (analysis.financials_history ?? [])
      .map(y => (typeof y?.year === 'number' ? String(y.year) : null))
      .filter((y): y is string => y !== null)
    addFeed('pappers', 'financials', analysis.creation_date, ...years)
  }
  if (
    (analysis.beneficial_owners?.length ?? 0) > 0 ||
    (analysis.c_level?.length ?? 0) > 0 ||
    (analysis.executives?.length ?? 0) > 0
  ) {
    addFeed('pappers', 'leadership')
  }

  const sec = analysis.us_sec_financials
  if (sec && secHasContent(sec)) {
    const dates = [
      ...(sec.filings ?? []).map(f => f?.date),
      ...(sec.revenues ?? []).map(f => f?.filed ?? f?.end),
      ...(sec.net_income ?? []).map(f => f?.filed ?? f?.end),
    ]
    addFeed('sec', 'financials', ...dates)
  }

  if ((analysis.public_tenders?.length ?? 0) > 0 || (analysis.awarded_contracts?.length ?? 0) > 0) {
    const dates = [
      ...(analysis.public_tenders ?? []).map(x => x?.published_date ?? x?.deadline),
      ...(analysis.awarded_contracts ?? []).map(x => x?.notified_date),
    ]
    addFeed('publicMarkets', 'tenders', ...dates)
  }

  if ((analysis.it_job_signals?.length ?? 0) > 0) {
    addFeed('employment', 'jobs', ...(analysis.it_job_signals ?? []).map(j => j?.date))
  }

  if (analysis.github_signals?.org) {
    addFeed('github', 'github', analysis.github_signals.last_activity)
  }

  // ── Sources de signaux (nom libre écrit par l'IA) ──────────────────────────
  for (const sig of analysis.recent_signals ?? []) {
    const canonical = canonicalizeSignalSource(sig?.source)
    if (canonical) {
      addFeed(canonical, 'signals', sig?.date)
      continue
    }
    const label = redactVendor(typeof sig?.source === 'string' ? sig.source.trim() : '')
    const rawKey = label.length > 0 ? `raw:${label.toLowerCase()}` : 'unknown'
    const bucket = rawSources.get(rawKey) ?? { label: label.length > 0 ? label : null, dates: [] }
    if (typeof sig?.date === 'string' && sig.date.trim().length > 0) bucket.dates.push(sig.date)
    rawSources.set(rawKey, bucket)
  }

  // ── Assemblage + tri ───────────────────────────────────────────────────────
  const canonicalSources: ProvenanceSource[] = PROVIDER_ORDER.filter(k => providers.has(k)).map(k => {
    const acc = providers.get(k)!
    return {
      key: k,
      providerKey: k,
      rawLabel: null,
      feeds: sortFeeds(acc.feeds),
      latestDate: freshest(acc.dates),
    }
  })

  const rawList = [...rawSources.entries()]
    .filter(([key]) => key !== 'unknown')
    .map(([key, v]) => ({
      key,
      providerKey: null,
      rawLabel: v.label,
      feeds: ['signals'] as FeedKey[],
      latestDate: freshest(v.dates),
    }))
    .sort(
      (a, b) => (dateMs(b.latestDate) ?? -Infinity) - (dateMs(a.latestDate) ?? -Infinity) || a.key.localeCompare(b.key),
    )

  const unknown = rawSources.get('unknown')
  const unknownSource: ProvenanceSource[] = unknown
    ? [{ key: 'unknown', providerKey: null, rawLabel: null, feeds: ['signals'], latestDate: freshest(unknown.dates) }]
    : []

  return {
    lastAnalyzedAt: lastAnalyzedAt ?? null,
    ageDays: ageInDays(lastAnalyzedAt, nowMs),
    reliability: reliability ?? null,
    tier: tier ?? null,
    sources: [...canonicalSources, ...rawList, ...unknownSource],
  }
}

/**
 * Noms de fournisseurs qui n'ont rien à faire dans la vue métier (recette
 * finale §55), et qui ne sont PAS captés par la canonicalisation ci-dessous.
 *
 * Le libellé d'un signal est du texte libre écrit par le modèle : « L'Agefi »,
 * « Les Échos », « BFM Bourse » sont des sources de presse légitimes et doivent
 * s'afficher telles quelles. Mais rien n'empêche le modèle d'écrire le nom d'un
 * outil de collecte, et ce nom-là appartient au back-office. On ne peut pas
 * l'interdire à l'écriture — on le rédige donc à l'affichage, en le remplaçant
 * par ce que la source EST plutôt que par le vide, qui ferait disparaître une
 * ligne de provenance vérifiable.
 */
const VENDOR_REDACTIONS: { pattern: RegExp; as: string }[] = [
  { pattern: /firecrawl|scraping|scrape/i, as: 'Site de l’entreprise' },
  { pattern: /\bbrave\b|\bserper\b|\btavily\b/i, as: 'Recherche web' },
  { pattern: /salesql|dropcontact/i, as: 'Source d’enrichissement' },
]

/** Remplace un nom d'outil par la capacité qu'il représente ; laisse tout le
 *  reste — un titre de presse est une preuve, pas un fournisseur. */
function redactVendor(label: string): string {
  for (const { pattern, as } of VENDOR_REDACTIONS) {
    if (pattern.test(label)) return as
  }
  return label
}

/** Map a free-text signal source to a canonical provider — ONLY on an
 *  unambiguous name match, so « BODACC », « Brave », « LinkedIn », « Site
 *  officiel » stay their own traceable rows rather than being force-merged. */
function canonicalizeSignalSource(raw: string | null | undefined): ProviderKey | null {
  const s = (raw ?? '').toLowerCase()
  if (!s.trim()) return null
  if (s.includes('apollo')) return 'apollo'
  if (s.includes('pappers') || s.includes('inpi')) return 'pappers'
  if (s.includes('edgar') || /\bsec\b/.test(s)) return 'sec'
  if (s.includes('boamp') || s.includes('decp')) return 'publicMarkets'
  if (
    s.includes('france travail') ||
    s.includes('francetravail') ||
    s.includes('pôle emploi') ||
    s.includes('pole emploi') ||
    s.includes('apec')
  ) {
    return 'employment'
  }
  if (s.includes('github')) return 'github'
  return null
}

function secHasContent(sec: NonNullable<AccountAnalysis['us_sec_financials']>): boolean {
  return (
    (sec.revenues?.length ?? 0) > 0 ||
    (sec.net_income?.length ?? 0) > 0 ||
    (sec.filings?.length ?? 0) > 0 ||
    Boolean(sec.shares_outstanding)
  )
}

const FEED_ORDER: FeedKey[] = ['firmographics', 'financials', 'leadership', 'tenders', 'jobs', 'github', 'signals']
function sortFeeds(feeds: Set<FeedKey>): FeedKey[] {
  return FEED_ORDER.filter(f => feeds.has(f))
}

/** UTC-ms of a date-ish string (bare year → Jan 1), shared clock with signals. */
function dateMs(date: string | null | undefined): number | null {
  return signalDateMs(date)
}

/** The most recent parseable date-ish string in the list, kept VERBATIM for
 *  display; `null` when none parses (→ the UI says « date inconnue »). */
function freshest(dates: string[]): string | null {
  let best: string | null = null
  let bestMs = -Infinity
  for (const d of dates) {
    const ms = dateMs(d)
    if (ms !== null && ms > bestMs) {
      bestMs = ms
      best = d
    }
  }
  return best
}

function ageInDays(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((nowMs - t) / DAY_MS))
}
