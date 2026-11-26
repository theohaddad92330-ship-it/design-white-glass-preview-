/**
 * #3920 — UNE fonction pure pour décider « quels signaux méritent une alerte ».
 *
 * Avant : le corps de la notification ne lisait pas le champ canonique `signal`
 * (retombait sur « N signaux détectés »), l'alerte partait à chaque analyse
 * sans filtre de fraîcheur, et la veille ne comparait que `recent_signals`.
 * Désormais les trois (corps, fraîcheur/dédoublonnage, veille) passent ici.
 *
 * Règles (tranchées dans l'issue) :
 *  - on ne notifie QUE les signaux datés dans les 30 derniers jours ;
 *  - un signal sans date ne déclenche JAMAIS d'alerte ;
 *  - un signal déjà vu (même clé d'identité dans l'analyse précédente) ne
 *    re-déclenche pas ;
 *  - le corps NOMME le fait (jamais « N signaux détectés ») ; plusieurs → le
 *    plus récent + « et N autres ». Aucun lien vers un corps de message privé.
 */

import { dropInternshipRows, isSignalArchived } from '@bellum/contracts'

const NEW_SIGNAL_FRESHNESS_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const BODY_LABEL_MAX = 160
/** #3920.5 — la cloche dit « via … » : le registre se nomme par sa NATURE, jamais par son sigle (doctrine : nos sources ne se nomment pas). */
const LEGAL_NOTICE_SOURCE = 'Annonces légales officielles'

type SignalKind = 'signal' | 'job' | 'tender' | 'legal'

type SignalCandidate = {
  /** Clé d'identité stable : type+url, sinon type+texte normalisé+date. */
  key: string
  kind: SignalKind
  label: string
  /** `null` = sans date exploitable → jamais d'alerte. */
  date: Date | null
  source: string | null
  url: string | null
}

/** Un signal déjà normalisé qu'un appelant apporte (ex. annonces de registre lues en continu). */
type ExtraSignalItem = { label: string; source: string; date: string | null; url: string | null }

/** Ce qu'on lit d'un compte : la colonne `recent_signals` et le `raw_analysis`. */
type SignalSnapshot = {
  recent_signals?: unknown
  raw_analysis?: unknown
  /** Sources lues hors `raw_analysis` (registres) — comparées comme les autres. */
  registry_items?: readonly ExtraSignalItem[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function firstText(record: Record<string, unknown>, fields: readonly string[]): string {
  for (const field of fields) {
    const text = readText(record[field])
    if (text) return text
  }
  return ''
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** ISO (`2026-09-30`, avec ou sans heure) ou français (`30/09/2026`). Jamais deviné. */
function parseSignalDate(value: unknown): Date | null {
  const text = readText(value)
  if (!text) return null
  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text)
  if (fr) {
    const date = new Date(Date.UTC(Number(fr[3]), Number(fr[2]) - 1, Number(fr[1])))
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

function toCandidate(
  kind: SignalKind,
  label: string,
  rawDate: unknown,
  url: string,
  source: unknown,
): SignalCandidate | null {
  if (!label) return null
  const date = parseSignalDate(rawDate)
  const dateKey = date ? date.toISOString().slice(0, 10) : ''
  const key = url ? `${kind}|url|${url.toLowerCase()}` : `${kind}|txt|${normalizeText(label)}|${dateKey}`
  return { key, kind, label, date, source: readText(source) || null, url: url || null }
}

function fromRecentSignals(value: unknown): SignalCandidate[] {
  // #4044 — une offre de stage n'est jamais un signal : aucune alerte, ni cloche ni e-mail.
  const rows = dropInternshipRows(value, { jobsOnly: true })
  const out: SignalCandidate[] = []
  for (const raw of rows) {
    const record = asRecord(raw)
    if (!record) continue
    // Un signal que l'IA a classé « archive » n'est jamais un signal neuf.
    if (record['freshness'] === 'archive') continue
    const candidate = toCandidate(
      'signal',
      firstText(record, ['signal', 'title', 'label', 'description', 'summary']),
      record['date'] ?? record['valid_from'],
      firstText(record, ['url', 'source_url']),
      record['source'],
    )
    if (candidate) out.push(candidate)
  }
  return out
}

function listOf(raw: Record<string, unknown> | null, snake: string, camel: string): unknown[] {
  const value = raw?.[snake] ?? raw?.[camel]
  return Array.isArray(value) ? value : []
}

function joinLabel(...parts: string[]): string {
  return parts.filter(Boolean).join(' — ')
}

/** Offres IT, appels d'offres, annonces légales — champs existants, jamais redéfinis. */
function fromStructured(rawAnalysis: unknown): SignalCandidate[] {
  const raw = asRecord(rawAnalysis)
  const out: SignalCandidate[] = []
  const push = (c: SignalCandidate | null): void => {
    if (c) out.push(c)
  }
  // #4044 — idem pour la liste brute des offres.
  for (const item of dropInternshipRows(listOf(raw, 'it_job_signals', 'itJobSignals'))) {
    const r = asRecord(item)
    if (!r) continue
    push(toCandidate('job', readText(r['title']), r['date'], readText(r['url']), r['source']))
  }
  for (const item of listOf(raw, 'public_tenders', 'publicTenders')) {
    const r = asRecord(item)
    if (!r) continue
    push(
      toCandidate(
        'tender',
        joinLabel(readText(r['title']), readText(r['buyer'])),
        r['published_date'] ?? r['publishedDate'],
        readText(r['url']),
        r['buyer'],
      ),
    )
  }
  for (const item of listOf(raw, 'legal_signals', 'legalSignals')) {
    const r = asRecord(item)
    if (!r) continue
    push(toCandidate('legal', readText(r['type']) || readText(r['label']), r['date'], '', LEGAL_NOTICE_SOURCE))
  }
  // #3920 — les autres listes que la phase 1 re-collecte (presse, marchés attribués,
  // événements du registre) : mêmes champs, même identité.
  for (const [snake, camel, kind] of [
    ['press_signals', 'pressSignals', 'signal'],
    ['awarded_contracts', 'awardedContracts', 'tender'],
    ['company_events', 'companyEvents', 'signal'],
  ] as const) {
    for (const item of listOf(raw, snake, camel)) {
      const r = asRecord(item)
      if (!r) continue
      push(
        toCandidate(
          kind,
          firstText(r, ['signal', 'title', 'type', 'label', 'object', 'description', 'summary']),
          r['date'] ?? r['published_date'] ?? r['publishedDate'],
          readText(r['url']),
          r['source'],
        ),
      )
    }
  }
  return out
}

function fromExtra(items: readonly ExtraSignalItem[] | undefined): SignalCandidate[] {
  const out: SignalCandidate[] = []
  for (const item of items ?? []) {
    const candidate = toCandidate('signal', readText(item.label), item.date, readText(item.url), item.source)
    if (candidate) out.push(candidate)
  }
  return out
}

/** Tous les signaux d'un compte (ou de sa version précédente), dédoublonnés par clé. */
export function collectSignals(snapshot: SignalSnapshot | null | undefined): SignalCandidate[] {
  if (!snapshot) return []
  const raw = asRecord(snapshot.raw_analysis)
  const recent = Array.isArray(snapshot.recent_signals) ? snapshot.recent_signals : raw?.['recent_signals']
  const byKey = new Map<string, SignalCandidate>()
  for (const candidate of [
    ...fromRecentSignals(recent),
    ...fromStructured(raw),
    ...fromExtra(snapshot.registry_items),
  ]) {
    if (!byKey.has(candidate.key)) byKey.set(candidate.key, candidate)
  }
  return [...byKey.values()]
}

export function signalIdentityKeys(snapshot: SignalSnapshot | null | undefined): Set<string> {
  return new Set(collectSignals(snapshot).map(c => c.key))
}

/**
 * Les signaux qui méritent une alerte : datés, dans les 30 derniers jours, absents
 * de `seen`. Triés du plus récent au plus ancien.
 */
export function selectNewSignals(
  current: SignalCandidate[],
  seen: ReadonlySet<string>,
  now: Date = new Date(),
  /** `null` = pas de fenêtre de 30 jours (la veille) : seul le périmé (`isSignalArchived`) est écarté. */
  windowDays: number | null = NEW_SIGNAL_FRESHNESS_DAYS,
): SignalCandidate[] {
  const oldest = windowDays === null ? null : now.getTime() - windowDays * DAY_MS
  return current
    .filter(c => {
      if (c.date === null || seen.has(c.key)) return false
      if (oldest !== null) return c.date.getTime() >= oldest
      return !isSignalArchived({ date: c.date.toISOString().slice(0, 10) }, now.getTime())
    })
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
}

function formatDate(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0')
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${d}/${m}/${date.getUTCFullYear()}`
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value
}

/** Corps de l'alerte : le fait le plus récent, sa date, « et N autres ». `null` si rien à nommer. */
export function buildNewSignalBody(fresh: SignalCandidate[]): string | null {
  const top = fresh[0]
  if (!top) return null
  const when = top.date ? ` (${formatDate(top.date)})` : ''
  const others = fresh.length - 1
  const extra = others > 0 ? ` — et ${others} autre${others > 1 ? 's' : ''}` : ''
  return `${truncate(top.label, BODY_LABEL_MAX)}${when}${extra}`
}
