import type {
  AccountFact,
  AccountFactBrief,
  AccountFactKind,
  AccountFactsBrief,
  RelanceHistory,
} from './account-facts.js'

/**
 * #4072 — deux lectures pures des faits du compte (#4069), partagées par les
 * écrans d'action (listes de cibles, alertes) : un seul endroit décide ce qui
 * est « un fait récent » et ce qui est « une récurrence ».
 */

/** Notes, corrections et échanges : du travail interne, pas un fait du compte à montrer en tête de ligne (les échanges ont leur propre rubrique). */
const INTERNAL_KINDS: ReadonlySet<AccountFactKind> = new Set(['note', 'correction', 'exchange'])
/** Les natures qui disent « le client a besoin de » — celles qu'un fait neuf peut répéter. */
const NEED_KINDS: ReadonlySet<AccountFactKind> = new Set(['need', 'hiring'])

function fold(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim()
}

/** #4072.5 — les `limit` faits les PLUS RÉCENTS (date, jamais poids), forme affichable, sans doublon. */
export function recentAccountFacts(facts: readonly AccountFact[], limit = 3): AccountFactBrief[] {
  const seen = new Set<string>()
  return facts
    .filter(f => !INTERNAL_KINDS.has(f.kind) && Number.isFinite(Date.parse(f.date)))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .filter(f => {
      const key = `${f.kind}|${f.date.slice(0, 10)}|${fold(f.label)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
    .map(f => ({ date: f.date, kind: f.kind, label: f.label, ...(f.url ? { url: f.url } : {}) }))
}

const STOP = new Set([
  'pour',
  'avec',
  'dans',
  'chez',
  'sans',
  'sur',
  'des',
  'les',
  'une',
  'recrutement',
  'poste',
  'besoin',
])
function significantWords(label: string): Set<string> {
  return new Set(
    fold(label)
      .split(' ')
      .filter(w => w.length >= 4 && !STOP.has(w)),
  )
}

/**
 * #4072.4 — un fait NEUF répète-t-il un besoin PASSÉ ? Rend le besoin passé le
 * plus récent qui partage au moins un mot significatif, daté d'un AUTRE jour
 * que le fait neuf (le même fait relu n'est pas une récurrence). `null` = rien.
 * Décision Louis 12/10 : un besoin récurrent est un signal fort — la
 * récurrence est SIGNALÉE, jamais chiffrée en probabilité.
 */
export function findRecurringNeed(
  fresh: { label: string; date: string | null },
  facts: readonly AccountFact[],
): AccountFact | null {
  const words = significantWords(fresh.label)
  if (words.size === 0) return null
  const freshDay = fresh.date ? fresh.date.slice(0, 10) : null
  const hits = facts
    .filter(f => NEED_KINDS.has(f.kind) && f.date.slice(0, 10) !== freshDay)
    .filter(f => [...significantWords(f.label)].some(w => words.has(w)))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
  return hits[0] ?? null
}

const DEAL_KINDS: ReadonlySet<AccountFactKind> = new Set(['deal_won', 'deal_lost', 'deal_dormant', 'deal_renewal'])

function briefOf(fact: AccountFact): AccountFactBrief {
  return { date: fact.date, kind: fact.kind, label: fact.label, ...(fact.url ? { url: fact.url } : {}) }
}

function newestFirst(
  facts: readonly AccountFact[],
  kinds: ReadonlySet<AccountFactKind>,
  limit: number,
): AccountFactBrief[] {
  const seen = new Set<string>()
  return facts
    .filter(f => kinds.has(f.kind) && Number.isFinite(Date.parse(f.date)))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .filter(f => {
      const key = `${f.kind}|${f.date.slice(0, 10)}|${fold(f.label)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
    .map(briefOf)
}

/** #4072.2 — les `limit` derniers échanges, en métadonnées, les plus récents d'abord. */
export function recentExchanges(facts: readonly AccountFact[], limit = 3): AccountFactBrief[] {
  return newestFirst(facts, new Set<AccountFactKind>(['exchange']), limit)
}

/**
 * #4072.3 — la fiche de préparation de RDV : affaires passées, missions, besoins
 * récurrents, derniers échanges. Tout vient du lecteur unique, déjà daté.
 */
export function buildAccountFactsBrief(asOf: string, facts: readonly AccountFact[]): AccountFactsBrief {
  const needs = new Map<string, { label: string; days: Set<string>; last: string }>()
  for (const f of facts) {
    if (!NEED_KINDS.has(f.kind) || !Number.isFinite(Date.parse(f.date))) continue
    const key = fold(f.label)
    if (!key) continue
    const entry = needs.get(key) ?? { label: f.label, days: new Set<string>(), last: f.date }
    entry.days.add(f.date.slice(0, 10))
    if (Date.parse(f.date) >= Date.parse(entry.last)) {
      entry.last = f.date
      entry.label = f.label
    }
    needs.set(key, entry)
  }
  const recurringNeeds = [...needs.values()]
    .filter(n => n.days.size >= 2)
    .sort((a, b) => b.days.size - a.days.size || Date.parse(b.last) - Date.parse(a.last))
    .slice(0, 5)
    .map(n => ({ label: n.label, occurrences: n.days.size, lastDate: n.last }))
  return {
    asOf,
    deals: newestFirst(facts, DEAL_KINDS, 8),
    missions: newestFirst(facts, new Set<AccountFactKind>(['mission']), 8),
    recurringNeeds,
    exchanges: recentExchanges(facts, 5),
    notes: newestFirst(facts, new Set<AccountFactKind>(['note']), 5),
    // #4424.3 — la reprise du R1 dans un R2 : comptes rendus et besoins enregistrés.
    meetings: newestFirst(facts, new Set<AccountFactKind>(['meeting']), 5),
    needs: newestFirst(facts, new Set<AccountFactKind>(['need']), 8),
  }
}

/**
 * #4072.2 — l'historique d'une relance : 3 derniers échanges (métadonnées) + 2
 * faits récents. `null` = rien de connu : la relance n'a alors aucune ligne de plus.
 */
export function relanceHistoryOf(facts: readonly AccountFact[]): RelanceHistory | null {
  const exchanges = recentExchanges(facts, 3)
  const recent_facts = recentAccountFacts(facts, 2)
  return exchanges.length === 0 && recent_facts.length === 0 ? null : { exchanges, recent_facts }
}

/**
 * #4072.1 — la clé de rapprochement d'un nom : accents, casse, ponctuation et
 * espaces neutralisés, MÊME règle que `personKey` de l'organigramme (« Jean
 * Dupond » n'est toujours pas « Jean Dupont » : on neutralise la forme, jamais
 * l'orthographe). Rapprochement exact, jamais approximatif.
 */
export function knownPersonKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** #4072.4 — la fenêtre de récurrence d'un signal : 30 jours, un seul endroit (GA-26). */
export const SIGNAL_RECURRENCE_WINDOW_DAYS = 30

/** Les natures qu'une récurrence de SIGNAL compte (recrutement, besoin, autre signal daté). */
const RECURRENCE_KINDS = ['hiring', 'need', 'signal'] as const
type SignalRecurrenceKind = (typeof RECURRENCE_KINDS)[number]

export interface SignalRecurrence {
  kind: SignalRecurrenceKind
  /** Rang du dernier signal dans la fenêtre : « 3e signal … en 30 jours ». Toujours ≥ 2. */
  count: number
  windowDays: number
}

/**
 * #4072.4 — « 3e signal de recrutement en 30 jours » : combien de signaux DISTINCTS d'une même nature
 * un compte a-t-il reçus dans la fenêtre. Un seul signal n'est pas une récurrence (`null`, jamais
 * « 1 »), le même fait relu deux fois le même jour non plus. Ex æquo : recrutement, besoin, signal.
 */
export function signalRecurrenceOf(
  facts: ReadonlyArray<Pick<AccountFact, 'kind' | 'date' | 'label'>>,
  asOf: Date,
  windowDays: number = SIGNAL_RECURRENCE_WINDOW_DAYS,
): SignalRecurrence | null {
  const end = asOf.getTime()
  const start = end - windowDays * 86_400_000
  const seen = new Set<string>()
  const counts = new Map<SignalRecurrenceKind, number>()
  for (const f of facts) {
    const kind = RECURRENCE_KINDS.find(k => k === f.kind)
    const t = Date.parse(f.date)
    if (!kind || !Number.isFinite(t) || t < start || t > end) continue
    const key = `${kind}|${f.date.slice(0, 10)}|${fold(f.label)}`
    if (seen.has(key)) continue
    seen.add(key)
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  let best: SignalRecurrence | null = null
  for (const kind of RECURRENCE_KINDS) {
    const count = counts.get(kind) ?? 0
    if (count >= 2 && (!best || count > best.count)) best = { kind, count, windowDays }
  }
  return best
}
