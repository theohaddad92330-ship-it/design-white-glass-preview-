import { DECIDED_STAGES } from './opportunity-ontology.js'

/**
 * #2325.36 — « détecte les actions contradictoires ».
 *
 * DÉCISION DE PORTÉE (documentée pour être relue et contestée, comme
 * `ageing`/`confidence` en #2325.11/.13) : l'issue ne définit pas ce mot, et ce
 * dépôt n'a pas de modèle de « contradiction sémantique » entre deux tâches —
 * en inventer un (deux titres qui « se contredisent ») serait deviner sur du
 * texte libre, exactement ce que la doctrine interdit (« un contrat non
 * vérifiable ne se devine pas »). La contradiction MESURABLE, sans rien
 * deviner, est celle qui oppose le dossier à lui-même : une affaire dont
 * l'ISSUE est CONNUE (`DECIDED_STAGES` — gagnée ou perdue, opportunity-
 * ontology.ts) porte encore une TÂCHE OUVERTE, comme si de rien n'était. Le
 * pipe dit « c'est fini », le plan d'action dit « il reste quelque chose à
 * faire » — deux affirmations qui ne peuvent pas être vraies toutes les deux.
 *
 * `dormant` (mis en veille, CLOSED_STAGES mais PAS DECIDED_STAGES) est
 * délibérément HORS champ : une veille n'annonce aucune issue, une tâche
 * ouverte dessus n'est pas contradictoire — c'est même parfois le rappel qui
 * doit la réveiller.
 */
export type OpportunityActionContradictionCandidate = {
  id: string
  stage: string
  /** Vient de `has_next_action` (déjà calculé par `pipelineHealth`) — jamais recalculé. */
  hasOpenTask: boolean
}

export type ContradictoryActionOpportunity = {
  opportunityId: string
  stage: string
}

/**
 * Les affaires dont l'issue est connue mais qui portent encore une tâche
 * ouverte.
 *
 * Déterministe, sans effet de bord, et vide quand il n'y a rien : une liste
 * vide veut dire « aucune contradiction parmi CE QU'ON A LU », jamais « aucune
 * dans l'espace ».
 */
export function detectContradictoryActions(
  opportunities: readonly OpportunityActionContradictionCandidate[],
): ContradictoryActionOpportunity[] {
  return opportunities
    .filter(opportunity => opportunity.hasOpenTask && (DECIDED_STAGES as readonly string[]).includes(opportunity.stage))
    .map(opportunity => ({ opportunityId: opportunity.id, stage: opportunity.stage }))
}
