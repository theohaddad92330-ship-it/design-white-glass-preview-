import type { AdminModelRoutingEntry } from '@/lib/admin'

/**
 * #2445.2 (épopée #2766) — le libellé d'UNE ligne de la politique de routage :
 * « par défaut » (rien de posé), « réglé » (un `LLM_ROUTE_<TASK>`/JSON posé
 * sur la tâche elle-même) ou « hérite de <tâche> » (aucun réglage propre, la
 * destination vient d'une autre tâche — `_TASK_ROUTE_INHERITS` côté IA).
 * Jamais deux badges à la fois : une tâche qui hérite n'est pas, en plus,
 * « réglée » — c'est la tâche dont elle hérite qui l'est.
 */
export function libelleSource(entry: AdminModelRoutingEntry): string {
  if (entry.inheritsFrom) return `hérite de ${entry.inheritsFrom}`
  return entry.overridden ? 'réglé' : 'par défaut'
}

/** Le modèle affiché : `null` (« hérite le modèle appelant ») rendu comme un
 *  mot, jamais une cellule vide qui se lirait comme une donnée manquante. */
export function libelleModele(model: string | null): string {
  return model ?? 'hérité de l’appel'
}

/** #2440.82 — l'état des évaluations d'UNE destination. « à évaluer » est dit
 *  tel quel : une destination jamais évaluée n'est jamais présentée « ok ». */
export function libelleEvaluations(entry: AdminModelRoutingEntry): string {
  if (entry.evalStatus === 'to_evaluate') return 'à évaluer'
  return entry.evalStatus === 'evaluated' ? 'évaluée' : 'référence'
}

/** Combien de capacités attendent leurs évaluations — le nombre que l'opérateur
 *  doit voir avant de lire le tableau. */
export function nombreAEvaluer(routes: AdminModelRoutingEntry[]): number {
  return routes.filter(route => route.evalStatus === 'to_evaluate').length
}

/** #2975 / #2440.82 — la clé de destination (`provider` ou `provider:model`)
 *  dans le MÊME format que lit `provider_evals.py` côté IA — construite ici
 *  une seule fois plutôt que recopiée à chaque appelant (GA-26). */
export function destinationKeyFor(entry: AdminModelRoutingEntry): string {
  return entry.model ? `${entry.provider}:${entry.model}` : entry.provider
}
