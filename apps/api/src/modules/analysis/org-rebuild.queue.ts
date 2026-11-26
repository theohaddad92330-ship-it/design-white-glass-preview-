import type { JobsOptions } from 'bullmq'

/**
 * Contrat BullMQ de la reconstruction du graphe d'organigramme.
 *
 * Pourquoi une file : une recherche ciblée qui ajoute des contacts doit les faire
 * apparaître sur la carte d'influence, et la carte se lit dans le graphe, que
 * seule la phase 3 écrit. Enchaîner les deux dans la requête du bouton, c'est
 * additionner deux budgets de phase (jusqu'à 180 s + 240 s) sur un clic — donc
 * faire dépendre un travail abouti de tout ce qui peut couper entre le navigateur
 * et nous. La recherche rend la main dès que les contacts sont au dossier ; la
 * carte se reconstruit derrière.
 */
export const ORG_REBUILD_QUEUE = 'org-rebuild'

/** Payload d'un job. Rien de figé au moment de la mise en file : le worker relit
 *  le compte et ses contacts, qui ont pu bouger entre l'enfilement et le run. */
export type OrgRebuildJobData = {
  accountId: string
  userId: string
}

/** Ce que le worker rend. Un refus MÉTIER (compte sans contact à classer, espace
 *  de démonstration) est une valeur de retour, pas une exception : le job a fait
 *  son travail, la réponse est « non ». Seule une panne remonte en exception. */
export type OrgRebuildJobResult = { ok: true; matched: number; total: number } | { ok: false; reason: string }

/**
 * Un job par COMPTE. Deux recherches ciblées lancées coup sur coup — deux cases
 * non couvertes, deux onglets — ne paient donc pas deux reconstructions du même
 * graphe : la seconde retrouve le job en cours.
 *
 * ⚠️ AUCUN `:` — BullMQ s'en sert comme séparateur de clés Redis et rejette tout
 * jobId qui en contient (leçon `contact-enrichment`). Le tiret est neutre.
 */
export function orgRebuildJobId(accountId: string): string {
  return `org-rebuild-${accountId}`
}

export const ORG_REBUILD_JOB_OPTIONS: JobsOptions = {
  // JAMAIS de retry : chaque tentative relance un fan-out LLM complet. Un échec
  // se voit dans l'état rendu au client, qui peut relancer « Enrichir
  // l'organigramme » — c'est son choix, pas une dépense décidée à sa place.
  attempts: 1,
  // Le résultat doit survivre au suivi côté client (et à un rechargement de page
  // pendant la reconstruction), et borner ce qu'on garde en Redis.
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 86_400 },
}
