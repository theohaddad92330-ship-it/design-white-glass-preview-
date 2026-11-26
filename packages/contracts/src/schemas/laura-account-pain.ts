import type { PainPoint, QualifiedHypothesis, RecentSignal } from './analysis/research.js'
import type { AccountSuggestionFact } from './laura-account-context.js'

/**
 * #3939.3 — LAURA PROPOSE D'ELLE-MÊME UNE DOULEUR SUR LE DOSSIER OUVERT.
 *
 * Décision Louis 13/10 (« oui, code-la ») sur la conception du lot LAURA-B :
 * une intervention du catalogue sur `/accounts/:id`, déclenchée quand le dossier
 * porte une hypothèse de douleur QUALIFIÉE fondée sur au moins un signal DATÉ.
 *
 * Ce fichier est la SEULE lecture de « cette douleur est-elle fondée et datée ? »
 * — le détecteur (API) et l'écran (âge affiché) lisent les mêmes fonctions, pour
 * que la règle vive à un seul endroit (GA-26).
 *
 * Doctrine tenue ici :
 *  · aucune probabilité — l'hypothèse se cite, sa convergence ne devient pas un %;
 *  · aucune source nommée — `source` reste `null` : le fait et sa DATE suffisent ;
 *  · une absence ne fait AUCUNE intervention — `[]`, jamais une carte vide ;
 *  · un signal sans date n'est jamais récent — une année seule, un texte libre,
 *    une date future : non daté, donc il ne fonde rien ;
 *  · un signal archivé (`freshness: archive`) ne fonde rien non plus.
 *
 * Deux lectures, dans cet ordre :
 *  1. `qualified_hypotheses` reliées par `based_on_signal_ids` (le SEUL lien, #2687
 *     — la même donnée que l'encadré « Hypothèses qualifiées » de la Veille) ;
 *  2. à défaut, `pains` rapprochées des signaux du MÊME domaine d'offre
 *     (`domain_code`) — la lecture de la question de douleur du chat
 *     (`_pain_evidence`, `chat_tools.py`, #3939 recette 13/10), son jumeau ici.
 */

/** Combien de signaux fondateurs voyagent avec l'hypothèse. */
const PAIN_SIGNALS_KEPT = 3

type SignalAge = { unit: 'days' | 'months'; value: number }

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH = /^(\d{4})-(\d{2})$/

/**
 * L'âge d'un signal, à la PRÉCISION que sa date porte — jamais plus fine.
 * `AAAA-MM-JJ` → jours ; `AAAA-MM` → mois ; tout le reste → `null` (non daté).
 * Une date future n'a pas été observée : `null`.
 */
export function signalAge(observedOn: string | null | undefined, now: Date): SignalAge | null {
  const raw = observedOn?.trim()
  if (!raw) return null
  const day = DAY.exec(raw)
  if (day) {
    const [y, m, d] = [Number(day[1]), Number(day[2]), Number(day[3])]
    const at = Date.UTC(y, m - 1, d)
    const check = new Date(at)
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    const days = Math.round((today - at) / 86_400_000)
    return days < 0 ? null : { unit: 'days', value: days }
  }
  const month = MONTH.exec(raw)
  if (month) {
    const [y, m] = [Number(month[1]), Number(month[2])]
    if (m < 1 || m > 12) return null
    const months = now.getUTCFullYear() * 12 + now.getUTCMonth() - (y * 12 + (m - 1))
    return months < 0 ? null : { unit: 'months', value: months }
  }
  return null
}

type PainReadable = {
  qualified_hypotheses?: readonly Partial<QualifiedHypothesis>[] | null
  pains?: readonly Partial<PainPoint>[] | null
  recent_signals?: readonly Partial<RecentSignal>[] | null
}

type DatedSignal = { id: string | null; text: string; date: string; domain: string | null }

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function datedSignals(signals: PainReadable['recent_signals'], now: Date): DatedSignal[] {
  return (signals ?? []).flatMap(signal => {
    const statement = text(signal?.signal)
    const date = text(signal?.date)
    if (!statement || !date || signal?.freshness === 'archive') return []
    if (!signalAge(date, now)) return []
    return [{ id: text(signal.id), text: statement, date, domain: text(signal.domain_code) }]
  })
}

/** Le plus récent d'abord — l'ordre lexical des dates ISO (jour ou mois) est l'ordre du temps. */
function youngestFirst(signals: DatedSignal[]): DatedSignal[] {
  return [...signals].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

type Candidate = { statement: string; signals: DatedSignal[] }

function pickYoungest(candidates: Candidate[]): Candidate | null {
  let best: Candidate | null = null
  for (const candidate of candidates) {
    if (!best || candidate.signals[0]!.date > best.signals[0]!.date) best = candidate
  }
  return best
}

/**
 * Les faits de l'intervention « douleur sourcée » — ou `[]` (Laura se tait).
 *
 * `[hypothèse, signal le plus récent, …]` : un fait `pain_hypothesis`, puis
 * jusqu'à trois `pain_signal` datés (date BRUTE en `observedOn`, l'écran en
 * dérive l'âge par {@link signalAge}).
 */
export function accountPainFacts(analysis: PainReadable, now: Date): AccountSuggestionFact[] {
  const signals = datedSignals(analysis.recent_signals, now)
  if (!signals.length) return []

  const fromHypotheses: Candidate[] = (analysis.qualified_hypotheses ?? []).flatMap(hypothesis => {
    const statement = text(hypothesis?.hypothesis)
    if (!statement) return []
    const ids = new Set((hypothesis.based_on_signal_ids ?? []).map(id => id.trim()).filter(Boolean))
    const founding = youngestFirst(signals.filter(signal => signal.id !== null && ids.has(signal.id)))
    return founding.length ? [{ statement, signals: founding }] : []
  })

  const fromPains: Candidate[] = (analysis.pains ?? []).flatMap(pain => {
    const statement = text(pain?.pain)
    const domain = text(pain?.domain_code)
    if (!statement || !domain) return []
    const matching = youngestFirst(signals.filter(signal => signal.domain === domain))
    return matching.length ? [{ statement, signals: matching }] : []
  })

  const chosen = pickYoungest(fromHypotheses) ?? pickYoungest(fromPains)
  if (!chosen) return []
  return [
    { kind: 'pain_hypothesis', statement: chosen.statement.slice(0, 400), source: null, observedOn: null, count: null },
    ...chosen.signals.slice(0, PAIN_SIGNALS_KEPT).map(signal => ({
      kind: 'pain_signal' as const,
      statement: signal.text.slice(0, 400),
      source: null,
      observedOn: signal.date.slice(0, 40),
      count: null,
    })),
  ]
}
