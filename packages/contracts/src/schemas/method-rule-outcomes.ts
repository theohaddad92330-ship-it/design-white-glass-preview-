/**
 * #3289 (suivi #3264.41) — l'ensemble `workspaceContradictedRuleIds` a enfin une
 * SOURCE : les issues déclarées des actions posées sous une règle du corpus
 * méthode (`action_plan_items.method_rule` × `outcome`, par espace).
 *
 * `resolveRuleActivation` / `selectApplicableMethodRules` (`method-corpus.ts`)
 * acceptaient cet ensemble sans que rien ne le calcule. Ce module le calcule ;
 * `MethodRuleOutcomesService` (apps/api) lit la donnée ; le pont Laura le
 * relaie à `apps/ia`, qui écarte la règle de SES citations pour cet espace.
 *
 * Tranché sans Louis : une règle est « contredite par cet espace » quand elle a
 * été suivie au moins {@link METHOD_RULE_CONTRADICTION_MIN_OUTCOMES} fois avec
 * une issue qui en dit quelque chose, et qu'AUCUNE n'a donné de résultat
 * positif. Jamais un pourcentage : un seul succès suffit à ne pas contredire, et
 * une règle qui n'a pas assez servi n'est jamais jugée (non mesuré ≠ contredit).
 */
import { METHOD_CORPUS_V1, resolveRuleActivation, type MethodCorpusVersion } from './method-corpus.js'

export const METHOD_RULE_CONTRADICTION_MIN_OUTCOMES = 5

/**
 * #3274.4 — les règles que les écrivains d'actions issues d'une recommandation
 * de Laura posent sur `action_plan_items.method_rule`. Avant, seule l'action
 * « prendre contact » (`couverture_multi_roles_niveaux_entites`) écrivait une
 * règle : une seule règle pouvait accumuler des issues, donc être contredite.
 * Tranché sans Louis : une action du plan généré = la discipline hebdomadaire
 * du plan de compte ; une relance de cadence = « le NON-résultat est un résultat ».
 */
export const METHOD_RULE_PLAN_STEP = 'plan_de_compte_hebdomadaire'
export const METHOD_RULE_CADENCE_FOLLOW_UP = 'non_resultat_est_un_resultat'

const POSITIVE = new Set([
  'positive',
  'qualified',
  'connected_qualified',
  'meeting_booked',
  'callback_scheduled',
  'need_confirmed',
  'information_obtained',
  'orientation_given',
])
const NEGATIVE = new Set(['no_response', 'no_answer', 'declined', 'refused', 'not_now', 'need_not_confirmed'])

/** `null` : l'issue ne dit rien de la règle (mauvais contact, erreur technique, abandon…). */
export function classifyRuleOutcome(outcome: string | null): 'positive' | 'negative' | null {
  if (outcome === null) return null
  if (POSITIVE.has(outcome)) return 'positive'
  if (NEGATIVE.has(outcome)) return 'negative'
  return null
}

export function computeContradictedRuleIds(
  rows: readonly { method_rule: string | null; outcome: string | null }[],
): string[] {
  const tally = new Map<string, { positive: number; negative: number }>()
  for (const row of rows) {
    if (!row.method_rule) continue
    const kind = classifyRuleOutcome(row.outcome)
    if (kind === null) continue
    const entry = tally.get(row.method_rule) ?? { positive: 0, negative: 0 }
    entry[kind] += 1
    tally.set(row.method_rule, entry)
  }
  return [...tally.entries()]
    .filter(([, entry]) => entry.positive === 0 && entry.negative >= METHOD_RULE_CONTRADICTION_MIN_OUTCOMES)
    .map(([ruleId]) => ruleId)
    .sort()
}

/**
 * #3274.4 — les règles que CET espace désactive : `resolveRuleActivation`
 * (`method-corpus.ts`) est évaluée deux fois par règle — sans, puis avec
 * l'ensemble des règles contredites — et seule une règle que la contradiction
 * fait basculer d'active à inactive est rendue. Un identifiant inconnu du
 * corpus, ou déjà inactif globalement (SUPERSEDED, désactivé, flag), n'a rien
 * à écarter pour l'espace. C'est l'appelant réel de la fonction, relayé par
 * `MethodRuleOutcomesService` → pont Laura → `apps/ia` (`chat.py`).
 */
export function workspaceDeactivatedRuleIds(
  rows: readonly { method_rule: string | null; outcome: string | null }[],
  corpus: MethodCorpusVersion = METHOD_CORPUS_V1,
): string[] {
  const contradicted = new Set(computeContradictedRuleIds(rows))
  if (contradicted.size === 0) return []
  const governanceByRuleId = new Map(corpus.governance.map(entry => [entry.rule_id, entry]))
  return corpus.rules
    .filter(rule => {
      const governance = governanceByRuleId.get(rule.rule_id)
      if (!governance || !contradicted.has(rule.rule_id)) return false
      return resolveRuleActivation(rule, governance, []) && !resolveRuleActivation(rule, governance, [], contradicted)
    })
    .map(rule => rule.rule_id)
    .sort()
}

// ── Règles APPRISES de l'espace (#3295) ─────────────────────────────────────

/**
 * Une action du plan cite une règle apprise de l'espace par `learned:<uuid>` —
 * dans la même colonne `method_rule` que le corpus, sans second champ : un
 * identifiant du corpus n'a jamais ce préfixe, donc les deux ne se confondent pas.
 */
const LEARNED_PREFIX = 'learned:'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function learnedRuleRef(ruleId: string): string {
  return `${LEARNED_PREFIX}${ruleId}`
}

/** L'identifiant d'une règle apprise, ou `null` si ce n'est pas une référence (id du corpus, texte libre). */
export function parseLearnedRuleRef(value: string | null | undefined): string | null {
  if (!value?.startsWith(LEARNED_PREFIX)) return null
  const id = value.slice(LEARNED_PREFIX.length)
  return UUID_RE.test(id) ? id : null
}

export interface LearnedRuleOutcomeTally {
  rule_id: string
  /** Actions posées sous la règle. */
  followed: number
  positive: number
  negative: number
  /** Issue déclarée qui ne dit rien de la règle (mauvais contact, erreur technique…). */
  inconclusive: number
  /** Pas encore faites, ou faites sans issue déclarée : non mesuré, jamais compté contre la règle. */
  open: number
  /** Même seuil que le corpus : au moins N issues parlantes et AUCUN succès. Un signal, jamais une désactivation. */
  contradicted: boolean
}

export function tallyLearnedRuleOutcomes(
  rows: readonly { method_rule: string | null; outcome: string | null; execution_status: string }[],
): LearnedRuleOutcomeTally[] {
  const byRule = new Map<string, LearnedRuleOutcomeTally>()
  for (const row of rows) {
    const ruleId = parseLearnedRuleRef(row.method_rule)
    if (!ruleId) continue
    const entry = byRule.get(ruleId) ?? {
      rule_id: ruleId,
      followed: 0,
      positive: 0,
      negative: 0,
      inconclusive: 0,
      open: 0,
      contradicted: false,
    }
    entry.followed += 1
    if (row.execution_status !== 'done' || row.outcome === null) entry.open += 1
    else {
      const kind = classifyRuleOutcome(row.outcome)
      if (kind === 'positive') entry.positive += 1
      else if (kind === 'negative') entry.negative += 1
      else entry.inconclusive += 1
    }
    byRule.set(ruleId, entry)
  }
  return [...byRule.values()]
    .map(entry => ({
      ...entry,
      contradicted: entry.positive === 0 && entry.negative >= METHOD_RULE_CONTRADICTION_MIN_OUTCOMES,
    }))
    .sort((a, b) => a.rule_id.localeCompare(b.rule_id))
}
