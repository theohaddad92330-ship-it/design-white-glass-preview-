import { keyNoteSchema, supplierNamesIn, type KeyNote } from '@bellum/contracts'

/**
 * #4078 — parité démo : les cinq blocs du dossier complet qu'aucune vraie
 * analyse n'écrivait (seul `sg-csv-complement.ts`, CSV SG/BPCE, les posait).
 *
 * - 16 `financial_indicators` et 17 `data_reliability_notes` : CALCULÉS ici,
 *   sans modèle, depuis ce que l'analyse a déjà collecté (comptes publiés,
 *   identité au registre, désambiguïsation, couverture des signaux) ;
 * - 01 `structural_reading_axes`, 14 `ecosystem_third_parties`, 15
 *   `opportunity_domains` : rendus par UN appel IA groupé (`POST /dossier-blocks`)
 *   puis filtrés ici (`sanitizeSynthesisNotes`).
 *
 * Même forme que la démo (`keyNoteSchema`) : l'écran ne change pas. Un bloc sans
 * matière ne fait AUCUNE ligne ; une source se nomme par sa NATURE (« comptes
 * publiés », « registre »), jamais par son outil (#4068).
 */
export const DOSSIER_BLOCK_KEYS = [
  'structural_reading_axes',
  'ecosystem_third_parties',
  'opportunity_domains',
  'financial_indicators',
  'data_reliability_notes',
] as const
type DossierBlockKey = (typeof DOSSIER_BLOCK_KEYS)[number]

/** Les trois blocs que produit le modèle (les deux autres sont calculés). */
export const SYNTHESIS_BLOCK_KEYS = [
  'structural_reading_axes',
  'ecosystem_third_parties',
  'opportunity_domains',
] as const

/**
 * Les clés à produire : les cinq, SAUF celles qu'un humain a corrigées
 * (`raw_analysis.human_corrected_blocks`) — « une correction humaine gagne toujours ».
 * Une clé déjà posée par un import ou une analyse antérieure est RAFRAÎCHIE par une
 * ré-analyse (décision Louis 15/10/2026, #4078 : elle renverse le « jamais réécrite »
 * du 12/10).
 */
export const HUMAN_CORRECTED_BLOCKS_KEY = 'human_corrected_blocks'

export function dossierBlockKeysToRefresh(raw: Record<string, unknown>): DossierBlockKey[] {
  const corrected = raw[HUMAN_CORRECTED_BLOCKS_KEY]
  const protectedKeys = new Set(Array.isArray(corrected) ? corrected.filter(k => typeof k === 'string') : [])
  return DOSSIER_BLOCK_KEYS.filter(key => !protectedKeys.has(key))
}

const PUBLISHED_ACCOUNTS = 'Calculé depuis les comptes publiés'
const COLLECTION_FINDING = 'Constat de collecte'

type Year = { year: number; revenue: number | null; netResult: number | null; headcount: number | null }

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

function yearsOf(raw: Record<string, unknown>): Year[] {
  const history = Array.isArray(raw['financials_history']) ? raw['financials_history'] : []
  return history
    .map((row): Year | null => {
      const r = (row ?? {}) as Record<string, unknown>
      const year = num(r['year'])
      if (year === null) return null
      return { year, revenue: num(r['revenue']), netResult: num(r['net_result']), headcount: num(r['headcount']) }
    })
    .filter((row): row is Year => row !== null)
    .sort((a, b) => a.year - b.year)
}

const pct = (value: number, signed: boolean): string =>
  `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1, signDisplay: signed ? 'exceptZero' : 'auto' }).format(value)} %`

const eur = (value: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

const note = (over: Partial<KeyNote> & { label: string; constat: string }): KeyNote => ({
  interpretation: null,
  implication: null,
  reliability: null,
  amount: null,
  currency: null,
  period: null,
  ...over,
})

/** Le premier et le dernier exercice qui portent une valeur > 0 — ou rien. */
function span(years: Year[], pick: (y: Year) => number | null): [Year, Year, number, number] | null {
  const kept = years.filter(y => (pick(y) ?? 0) > 0)
  const first = kept[0]
  const last = kept[kept.length - 1]
  if (!first || !last || first.year === last.year) return null
  return [first, last, pick(first) as number, pick(last) as number]
}

/**
 * #4078.4 — bloc 16. Des RATIOS dérivés des comptes publiés, jamais une copie de
 * `financials_history` (déjà affiché) : évolution du CA, marge nette, CA par
 * salarié, évolution des effectifs. Un ratio sans dénominateur (CA ou effectif
 * nul ou absent) ne fait pas de ligne — jamais un « 0 ». `amount` ne porte que
 * le CA par salarié (une somme en euros : `financials_history` vient du registre
 * français) ; un pourcentage reste dans le constat, l'écran formatant `amount`
 * comme une somme.
 */
export function computeFinancialIndicators(raw: Record<string, unknown>): KeyNote[] {
  const years = yearsOf(raw)
  const notes: KeyNote[] = []

  const revenue = span(years, y => y.revenue)
  if (revenue) {
    const [first, last, from, to] = revenue
    notes.push(
      note({
        label: 'Évolution du chiffre d’affaires',
        constat: `${pct(((to - from) / from) * 100, true)} entre les exercices ${first.year} et ${last.year} (${eur(from)} → ${eur(to)}).`,
        reliability: PUBLISHED_ACCOUNTS,
        period: `${first.year}–${last.year}`,
      }),
    )
  }

  const margin = [...years].reverse().find(y => (y.revenue ?? 0) > 0 && y.netResult !== null)
  // #recette-21-10-K1 — un résultat supérieur au CA est celui d'une holding (dividendes des
  // filiales) : aucune marge, jamais une marge > 100 %.
  if (margin && margin.revenue !== null && margin.netResult !== null && margin.netResult <= margin.revenue) {
    notes.push(
      note({
        label: 'Marge nette',
        constat: `Résultat net rapporté au chiffre d’affaires : ${pct((margin.netResult / margin.revenue) * 100, false)} sur l’exercice ${margin.year}.`,
        reliability: PUBLISHED_ACCOUNTS,
        period: String(margin.year),
      }),
    )
  }

  const perHead = [...years].reverse().find(y => (y.revenue ?? 0) > 0 && (y.headcount ?? 0) > 0)
  if (perHead && perHead.revenue !== null && perHead.headcount !== null) {
    notes.push(
      note({
        label: 'Chiffre d’affaires par salarié',
        constat: `Chiffre d’affaires divisé par l’effectif déclaré de l’exercice ${perHead.year}.`,
        reliability: PUBLISHED_ACCOUNTS,
        amount: Math.round(perHead.revenue / perHead.headcount),
        currency: 'EUR',
        period: String(perHead.year),
      }),
    )
  }

  const headcount = span(years, y => y.headcount)
  if (headcount) {
    const [first, last, from, to] = headcount
    notes.push(
      note({
        label: 'Évolution des effectifs',
        constat: `${pct(((to - from) / from) * 100, true)} entre les exercices ${first.year} et ${last.year} (${from} → ${to} salariés).`,
        reliability: PUBLISHED_ACCOUNTS,
        period: `${first.year}–${last.year}`,
      }),
    )
  }
  return notes
}

/** « 2024-01-15 », « 2024-01 », « 2024 » → la date ; autre chose → `null` (jamais devinée). */
function parseSignalDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(value.trim())
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2] ?? '1') - 1, Number(match[3] ?? '1')))
  return Number.isNaN(date.getTime()) ? null : date
}

/** L'analyse a-t-elle collecté quoi que ce soit sur l'identité du compte ? */
const hasRegistryIdentity = (raw: Record<string, unknown>): boolean =>
  ['legal_form', 'creation_date', 'activity_label', 'capital'].some(key => raw[key] !== undefined && raw[key] !== null)

/** Signaux plus vieux que ça ⇒ « signaux anciens ». */
const STALE_SIGNAL_MONTHS = 12
/** Dernier exercice publié plus vieux que l'année N-2 ⇒ « comptes anciens ». */
const STALE_ACCOUNTS_YEARS = 2

/**
 * #4078.5 — bloc 17. Les mises en garde sur la FIABILITÉ DES DONNÉES, tirées de
 * ce qui MANQUE ou est ANCIEN dans la collecte — jamais un risque commercial
 * (`risks` le porte). Chaque règle ne fait une ligne que si son constat tient ;
 * un dossier sans matière, ou sain, n'en fait aucune.
 */
export function computeDataReliabilityNotes(raw: Record<string, unknown>, now: Date): KeyNote[] {
  const notes: KeyNote[] = []
  const filed = yearsOf(raw).filter(y => y.revenue !== null || y.netResult !== null || y.headcount !== null)
  const lastFiled = filed[filed.length - 1]

  if (lastFiled && lastFiled.year < now.getUTCFullYear() - STALE_ACCOUNTS_YEARS) {
    notes.push(
      note({
        label: 'Comptes anciens',
        constat: `Les derniers comptes publiés portent sur l’exercice ${lastFiled.year}.`,
        implication: 'Ne pas citer ces chiffres comme actuels sans les vérifier.',
        reliability: COLLECTION_FINDING,
        period: String(lastFiled.year),
      }),
    )
  } else if (!lastFiled && hasRegistryIdentity(raw)) {
    notes.push(
      note({
        label: 'Comptes non publiés',
        constat: 'Aucun compte annuel publié n’a été trouvé pour cette entité.',
        implication: 'N’avancer aucun chiffre d’affaires sans source.',
        reliability: COLLECTION_FINDING,
      }),
    )
  }

  const homonyms = (raw['homonyms'] ?? {}) as Record<string, unknown>
  if (homonyms['status'] === 'selected') {
    notes.push(
      note({
        label: 'Entité retenue sans confirmation',
        constat: 'L’entité juridique a été retenue parmi plusieurs homonymes, sans confirmation humaine.',
        implication: 'Vérifier le SIREN avant de citer un chiffre ou une structure.',
        reliability: COLLECTION_FINDING,
      }),
    )
  } else if (homonyms['status'] === 'ambiguous') {
    notes.push(
      note({
        label: 'Entité non départagée',
        constat: 'Plusieurs entités juridiques homonymes restent plausibles.',
        implication: 'Confirmer l’entité visée avant d’utiliser le dossier.',
        reliability: COLLECTION_FINDING,
      }),
    )
  }

  const coverage = (raw['signal_coverage'] ?? {}) as Record<string, unknown>
  if (coverage['status'] === 'incomplete') {
    notes.push(
      note({
        label: 'Recherche de signaux incomplète',
        constat: 'Une partie des sources de signaux n’a pas répondu pendant l’analyse.',
        implication: 'L’absence d’un signal ne prouve pas l’absence d’activité.',
        reliability: COLLECTION_FINDING,
      }),
    )
  }

  const signals = Array.isArray(raw['recent_signals']) ? raw['recent_signals'] : []
  const dates = signals
    .map(signal => parseSignalDate(((signal ?? {}) as Record<string, unknown>)['date']))
    .filter((date): date is Date => date !== null)
  if (dates.length > 0) {
    const latest = new Date(Math.max(...dates.map(date => date.getTime())))
    const threshold = new Date(now)
    threshold.setUTCMonth(threshold.getUTCMonth() - STALE_SIGNAL_MONTHS)
    if (latest < threshold) {
      const month = `${String(latest.getUTCMonth() + 1).padStart(2, '0')}/${latest.getUTCFullYear()}`
      notes.push(
        note({
          label: 'Signaux anciens',
          constat: `Le signal daté le plus récent remonte à ${month}.`,
          implication: 'Relire l’actualité du compte avant un premier contact.',
          reliability: COLLECTION_FINDING,
        }),
      )
    }
  }
  return notes
}

const TEXT_FIELDS = ['label', 'constat', 'interpretation', 'implication', 'reliability'] as const

const clean = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > 0 ? text : null
}

/**
 * #4078.1-.3 — ce que rend le modèle pour les blocs 01/14/15, avant écriture :
 * forme `keyNoteSchema` exacte, libellé obligatoire, chiffres imposés à `null`,
 * et une note qui nomme un de NOS fournisseurs est JETÉE (#4068) — pas
 * réécrite : on ne devine pas la nature d'une source à sa place.
 */
export function sanitizeSynthesisNotes(value: unknown): KeyNote[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): KeyNote[] => {
    if (!keyNoteSchema.safeParse(item).success) return []
    const source = item as Record<string, unknown>
    const fields = Object.fromEntries(TEXT_FIELDS.map(field => [field, clean(source[field])])) as Record<
      (typeof TEXT_FIELDS)[number],
      string | null
    >
    if (!fields.label) return []
    if (supplierNamesIn(Object.values(fields).join(' ')).length > 0) return []
    return [{ ...fields, amount: null, currency: null, period: null }]
  })
}
