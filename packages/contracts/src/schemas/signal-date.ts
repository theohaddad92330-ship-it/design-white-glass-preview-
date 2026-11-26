// ── Signal date precision ────────────────────────────────────────────────────
// `recent_signals[].date` is FREE TEXT produced by the LLM — the IA's own
// docstring (apps/ia/app/services/signal_freshness.py) lists the shapes it
// carries: "2021", "10 mars 2021", "2021-03-10", "2023-2024", "Non daté
// précisément". The web layer used to run that through `new Date()`, which
// INVENTS precision the source never had:
//
//   new Date('2026')          → 2026-01-01  → rendered "1 janv. 2026"
//   new Date('juillet 2026')  → 2026-01-01  → the MONTH is silently discarded
//   new Date('3 days ago')    → Invalid     → the raw English leaked into the FR UI
//
// Project rule: JAMAIS de données fictives. So we parse the precision that is
// actually present and let the view render exactly that — "2026" stays "2026".

export type SignalDateValue =
  | { kind: 'day'; year: number; month: number; day: number }
  | { kind: 'month'; year: number; month: number }
  | { kind: 'year'; year: number }
  | { kind: 'range'; from: number; to: number }
  | { kind: 'relative'; amount: number; unit: SignalDateRelativeUnit }
  | { kind: 'unknown' }

export type SignalDateRelativeUnit = 'day' | 'week' | 'month' | 'year'

const YEAR = /(?:19|20)\d{2}/

/** Month names the IA emits, FR and EN, with and without accents/abbreviations. */
const MONTH_NAMES: ReadonlyArray<readonly string[]> = [
  ['janvier', 'janv', 'january', 'jan'],
  ['fevrier', 'fevr', 'february', 'feb'],
  ['mars', 'march', 'mar'],
  ['avril', 'avr', 'april', 'apr'],
  ['mai', 'may'],
  ['juin', 'june', 'jun'],
  ['juillet', 'juil', 'july', 'jul'],
  ['aout', 'august', 'aug'],
  ['septembre', 'sept', 'september', 'sep'],
  ['octobre', 'oct', 'october'],
  ['novembre', 'nov', 'november'],
  ['decembre', 'dec', 'december'],
]

const RELATIVE_UNITS: ReadonlyArray<readonly [SignalDateRelativeUnit, readonly string[]]> = [
  ['day', ['day', 'days', 'jour', 'jours']],
  ['week', ['week', 'weeks', 'semaine', 'semaines']],
  ['month', ['month', 'months', 'mois']],
  ['year', ['year', 'years', 'an', 'ans', 'annee', 'annees']],
]

/** Lowercase, strip accents — so "février"/"fevrier" and "Juillet" all match. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function isRealDay(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
}

function monthFromName(token: string): number | null {
  const index = MONTH_NAMES.findIndex(names => names.includes(token))
  return index === -1 ? null : index + 1
}

/**
 * Parse a free-text signal date into the precision it actually carries.
 * Never widens precision: a bare year stays a year, a year+month stays a month.
 */
export function parseSignalDate(raw: string | null | undefined): SignalDateValue {
  const text = normalize(String(raw ?? ''))
  if (!text) return { kind: 'unknown' }

  // "2023-2024" / "2023–2024" — a range, not a year with month 20.
  const range = new RegExp(`^(${YEAR.source})\\s*[-–/]\\s*(${YEAR.source})$`).exec(text)
  if (range) return { kind: 'range', from: Number(range[1]), to: Number(range[2]) }

  // "il y a 3 jours" / "3 days ago" — relative to an anchor we do not reliably
  // know, so it is kept AS a relative value and translated at render time.
  const relative =
    /(?:il\s+y\s+a\s+)?(\d{1,3})\s+([a-z]+)(?:\s+ago)?/.exec(text) ?? /(?:il\s+y\s+a\s+)(\d{1,3})\s+([a-z]+)/.exec(text)
  if (relative && (text.includes('ago') || text.includes('il y a'))) {
    const amount = Number(relative[1])
    const unit = RELATIVE_UNITS.find(([, words]) => words.includes(relative[2] ?? ''))
    if (unit && amount > 0) return { kind: 'relative', amount, unit: unit[0] }
  }

  // ISO-ish: 2026-07-15 / 2026/07/15 / 2026-07 / 2026
  const iso = new RegExp(`(${YEAR.source})(?:[-/](\\d{1,2})(?:[-/](\\d{1,2}))?)?`).exec(text)

  // "10 mars 2021" / "mars 2021" / "15 July 2026"
  const named = new RegExp(`(?:(\\d{1,2})\\s+)?([a-z]{3,10})\\.?\\s+(${YEAR.source})`).exec(text)
  if (named) {
    const month = monthFromName(named[2] ?? '')
    if (month !== null) {
      const year = Number(named[3])
      const day = named[1] ? Number(named[1]) : null
      if (day !== null && isRealDay(year, month, day)) return { kind: 'day', year, month, day }
      return { kind: 'month', year, month }
    }
  }

  if (!iso) return { kind: 'unknown' }

  const year = Number(iso[1])
  const month = iso[2] ? Number(iso[2]) : null
  const day = iso[3] ? Number(iso[3]) : null

  // Out-of-range parts DEGRADE the precision rather than being clamped into a
  // date the source never stated.
  if (month === null || month < 1 || month > 12) return { kind: 'year', year }
  if (day === null) return { kind: 'month', year, month }
  if (!isRealDay(year, month, day)) return { kind: 'month', year, month }
  return { kind: 'day', year, month, day }
}

/**
 * The month (and optional day) written in letters just BEFORE a year: "10 mars"
 * → {month 3, day 10}, "octobre" → {month 10, day null}. `null` when the text
 * does not end on a month name. Used by `signalDateMs` (account.ts), which
 * anchors on the first year — moitié TS de #4647, dont la moitié Python est
 * `_read_parts` / `_MONTHS_FR` (apps/ia/app/services/signal_freshness.py) :
 * corriger l'une sans l'autre laisse l'autre mentir. Les cas partagés sont
 * tenus des deux côtés (signal-date.test.ts ↔ test_signal_freshness.py, #4716).
 *
 * ⚠️ Asymétrie connue, pas un oubli : `MONTH_NAMES` (ci-dessus, déjà lu par
 * `parseSignalDate` avant #4716) contient les mois ANGLAIS, que `_MONTHS_FR`
 * refuse volontairement (« à mesurer avant d'élargir », #4647). « 23 october
 * 2026 » se lit donc au jour en TS et à l'année en Python.
 */
export function monthDayBeforeYear(before: string): { month: number; day: number | null } | null {
  const m = /(?:(\d{1,2})(?:er)?\s+)?([a-z]{3,9})\.?\s*$/.exec(normalize(before))
  if (!m) return null
  const month = monthFromName(m[2] ?? '')
  if (month === null) return null
  return { month, day: m[1] ? Number(m[1]) : null }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * #4832 — LA lecture d'une date INCOMPLÈTE, au même endroit pour tout le paquet (GA-26) : la FIN de sa période
 * (31/12 pour une année, dernier jour pour un mois), jamais son début. Miroir de `read_signal_date`
 * (`apps/ia/app/services/signal_freshness.py`, #4647, tranché par Louis le 27/10/2026) : « 2024 » est `current`
 * pour l'IA, il ne doit pas être `archive` à l'écran. Sans mois, l'année entière ; mois hors 1-12 = année entière.
 */
export function periodEndMs(year: number, month?: number | null): number {
  if (month === null || month === undefined || month < 1 || month > 12) return Date.UTC(year, 11, 31)
  return Date.UTC(year, month, 0)
}
const RELATIVE_MS: Record<SignalDateRelativeUnit, number> = {
  day: MS_PER_DAY,
  week: 7 * MS_PER_DAY,
  month: 30 * MS_PER_DAY,
  year: 365 * MS_PER_DAY,
}

/**
 * A timestamp for ORDERING ONLY — never rendered, so anchoring a relative
 * expression on `now` here fabricates nothing on screen. Without it a signal
 * dated "3 days ago" parsed to NaN and sorted LAST, letting a year-only "2026"
 * (→ 1 January) win the "most recent signal" slot on the Veille.
 * `null` when the value carries no usable order at all.
 *
 * #4832 — DEUX horloges voulues, une par usage : ICI l'ORDRE, où une date vague passe SOUS une date précise de la
 * même période (début de période — sinon « 2026 » devancerait « 2026-07-15 »). L'ÂGE (archive / current, fenêtres des
 * digests, « le plus récent » de la provenance) lit la FIN de période, `periodEndMs` / `signalDateMs` : un fait
 * n'est pas vieilli par défaut. Ne pas les réunir : ce sont deux questions.
 */
export function signalSortMs(value: SignalDateValue, nowMs: number = Date.now()): number | null {
  switch (value.kind) {
    case 'day':
      return Date.UTC(value.year, value.month - 1, value.day)
    case 'month':
      return Date.UTC(value.year, value.month - 1, 1)
    case 'year':
      return Date.UTC(value.year, 0, 1)
    case 'range':
      return Date.UTC(value.to, 0, 1)
    case 'relative':
      return nowMs - value.amount * RELATIVE_MS[value.unit]
    case 'unknown':
      return null
  }
}

/**
 * #3928.2 — vrai quand la date PARSÉE est strictement postérieure à `now`, à la
 * précision qu'elle porte (un mois courant n'est pas futur, une année courante non
 * plus). Inconnue, relative ou plage : faux — on n'écarte jamais sur une absence.
 * Une date de publication ne peut pas être future : c'est un horizon (programme,
 * échéance) ou une erreur de lecture, et l'écran le NOMME au lieu de l'afficher
 * comme un fait passé.
 */
export function isFutureSignalDate(raw: string | null | undefined, now: Date = new Date()): boolean {
  const value = parseSignalDate(raw)
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const day = now.getUTCDate()
  switch (value.kind) {
    case 'day':
      return compare3(value, year, month, day) > 0
    case 'month':
      return value.year > year || (value.year === year && value.month > month)
    case 'year':
      return value.year > year
    default:
      return false
  }
}

function compare3(value: { year: number; month: number; day: number }, y: number, m: number, d: number): number {
  return value.year - y || value.month - m || value.day - d
}

/**
 * #3917.r39 — le prédicat UNIQUE « cette actualité est datée au jour » (GA-26). Une
 * actualité se date ou se retire (doctrine : dans une liste, une absence ne fait aucune
 * ligne) : une année seule, un mois seul, une plage ou une valeur illisible = non datée.
 * Une date relative d'un jour (« il y a 3 jours ») porte un jour : elle compte.
 */
export function isSignalDatedToTheDay(raw: string | null | undefined): boolean {
  const value = parseSignalDate(raw)
  return value.kind === 'day' || (value.kind === 'relative' && value.unit === 'day')
}
