/**
 * Les neuf indicateurs du §12 du rapport besoins.
 *
 * Arbitrage Louis du 03/08 : **back-office uniquement**. Même règle que les
 * coûts fournisseurs (D19) — la qualité mesurée est une donnée d'exploitation.
 * Affichée à un utilisateur, elle devient une promesse chiffrée qu'il faut
 * tenir ; affichée à l'opérateur, elle devient un outil pour la tenir.
 *
 * La règle qui traverse le fichier est celle du registre des coûts : **on
 * n'invente pas un dénominateur**. Un taux calculé sur zéro action n'est pas
 * 0 % ni 100 % — il est `null`, et l'écran affiche « non mesuré ». C'est ce qui
 * évite qu'un espace créé hier affiche « 0 % d'exécution vérifiée » et qu'on
 * passe la journée à chercher la panne.
 */

/** Une action journalisée, telle que `user_actions` la conserve. */
export type ActionRecord = {
  actionType: string
  /** Ce que l'action a produit. `null` quand l'ancienne trace ne le disait pas. */
  outcome?: 'success' | 'failed' | 'partial' | null
  /** Durée observée, en millisecondes. `null` = non mesurée. */
  durationMs?: number | null
  /** L'erreur portait-elle une cause lisible et une reprise ? */
  errorExplained?: boolean | null
  userId: string
}

export type QualityIndicator = {
  key:
    | 'verified_execution'
    | 'hallucination'
    | 'useful_drafts'
    | 'multi_tool_success'
    | 'response_time'
    | 'proactive_adoption'
    | 'recoverable_errors'
  label: string
  /** `null` = non mesuré. JAMAIS zéro par défaut. */
  value: number | null
  /** L'unité : `rate` de 0 à 1, `ms`, ou un décompte. */
  unit: 'rate' | 'ms' | 'count'
  /** La cible annoncée par le rapport, pour situer la valeur. */
  target: string
  /** Sur combien d'observations. Zéro ⇒ `value` est `null`. */
  sample: number
}

/** Un taux, ou `null` quand il n'y a rien à diviser. */
function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null
}

/** La médiane plutôt que la moyenne : un seul run de trois minutes déplace une
 *  moyenne et fait croire à une lenteur générale. */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? Math.round((sorted[middle - 1]! + sorted[middle]!) / 2) : sorted[middle]!
}

// #2108.57 — `draft_created`/`message_generated` n'étaient écrits par AUCUN
// appelant (`git grep` = 0 résultat) : le filtre comparait à un vocabulaire
// mort et `useful_drafts` restait bloqué à `sample: 0` pour toujours. Le seul
// écrivain réel est `EngagementPanel.tsx:156` (`trackMessageGenerated`), qui
// pose `action_type: 'plan_action_message_generated'` — la valeur de
// `actionTypeSchema` (`@bellum/contracts`) déjà couverte par le CHECK SQL de
// `user_actions` (aucune migration à ajouter, la valeur existe depuis
// `1783000000001-UserActionsPlanActions`).
const DRAFT_ACTIONS = new Set(['plan_action_message_generated'])
const MULTI_TOOL_ACTIONS = new Set(['workflow_run', 'batch_send', 'crm_sync'])

/**
 * Calcule les indicateurs à partir des actions journalisées.
 *
 * `routinesByUser` vient d'ailleurs (les abonnements aux routines) : l'adoption
 * proactive ne se lit pas dans un journal d'actions, elle se lit dans ce que les
 * gens ont ACTIVÉ.
 */
export function computeQualityIndicators(input: {
  actions: readonly ActionRecord[]
  routinesByUser: ReadonlyMap<string, number>
}): QualityIndicator[] {
  const { actions } = input

  const decided = actions.filter(a => a.outcome === 'success' || a.outcome === 'failed')
  const succeeded = decided.filter(a => a.outcome === 'success').length

  const drafts = actions.filter(a => DRAFT_ACTIONS.has(a.actionType))
  const draftsKept = drafts.filter(a => a.outcome === 'success').length

  const multiTool = actions.filter(a => MULTI_TOOL_ACTIONS.has(a.actionType))
  const multiToolDecided = multiTool.filter(a => a.outcome === 'success' || a.outcome === 'failed')
  const multiToolOk = multiToolDecided.filter(a => a.outcome === 'success').length

  const durations = actions
    .map(a => a.durationMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0)

  const failures = actions.filter(a => a.outcome === 'failed')
  const explained = failures.filter(a => a.errorExplained === true).length

  // L'adoption se mesure sur les utilisateurs ACTIFS — ceux qui ont fait quelque
  // chose. Rapporter à tous les comptes créés mesurerait l'inscription, pas
  // l'usage.
  const activeUsers = new Set(actions.map(a => a.userId))
  const usersWithTwoRoutines = [...activeUsers].filter(user => (input.routinesByUser.get(user) ?? 0) >= 2).length

  return [
    {
      key: 'verified_execution',
      label: 'Actions réellement exécutées',
      value: rate(succeeded, decided.length),
      unit: 'rate',
      target: '> 95 %',
      sample: decided.length,
    },
    {
      key: 'hallucination',
      label: 'Actions annoncées mais non abouties',
      // Le complément du précédent : ce que le rapport appelle « hallucination
      // factuelle » se mesure ici comme un écart entre annonce et résultat.
      value: rate(decided.length - succeeded, decided.length),
      unit: 'rate',
      target: '< 1 %',
      sample: decided.length,
    },
    {
      key: 'useful_drafts',
      label: 'Brouillons conservés',
      value: rate(draftsKept, drafts.length),
      unit: 'rate',
      target: '> 80 %',
      sample: drafts.length,
    },
    {
      key: 'multi_tool_success',
      label: 'Enchaînements multi-outils aboutis',
      value: rate(multiToolOk, multiToolDecided.length),
      unit: 'rate',
      target: '> 90 %',
      sample: multiToolDecided.length,
    },
    {
      key: 'response_time',
      label: 'Temps jusqu’au premier résultat (médiane)',
      value: median(durations),
      unit: 'ms',
      target: '< 15 s',
      sample: durations.length,
    },
    {
      key: 'proactive_adoption',
      label: 'Utilisateurs actifs avec au moins deux routines',
      value: activeUsers.size > 0 ? usersWithTwoRoutines : null,
      unit: 'count',
      target: '≥ 2 routines par utilisateur actif',
      sample: activeUsers.size,
    },
    {
      key: 'recoverable_errors',
      label: 'Erreurs expliquées avec une reprise',
      value: rate(explained, failures.length),
      unit: 'rate',
      target: '100 %',
      sample: failures.length,
    },
  ]
}
