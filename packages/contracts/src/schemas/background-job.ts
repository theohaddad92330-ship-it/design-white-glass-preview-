/**
 * La forme d'un travail rendu à la main : accusé de réception, puis suivi.
 *
 * Extraite de l'enrichissement contact quand la re-planification a eu besoin de
 * la même chose (#1092). Une seule définition plutôt que deux jumelles : ce sont
 * les mêmes états, avec les mêmes promesses, et deux copies auraient divergé au
 * premier état ajouté.
 *
 * La distinction qui porte tout le contrat est `unknown` : plus aucune trace du
 * job (résultat expiré, Redis vidé, worker mort). Ce n'est PAS un échec du
 * travail — c'est NOTRE réponse qui manque. Un écran qui le rendrait « échoué »
 * pousserait à relancer, donc à repayer ce qui a peut-être déjà abouti.
 */
export type BackgroundJobState = 'queued' | 'running' | 'done' | 'failed' | 'unknown'

/**
 * Réponse du POST : le travail est en file — ou déjà en cours si un geste
 * précédent l'a lancé. Même objet ⇒ même job : jamais deux exécutions payées en
 * parallèle sur la même chose.
 */
export type BackgroundJobAccepted = {
  job_id: string
  state: Extract<BackgroundJobState, 'queued' | 'running'>
}

/**
 * État d'un travail. `TResult` = la charge utile du succès, laissée générique
 * pour que ce module ne dépende d'aucun schéma métier.
 *
 * `failed` n'apparaît JAMAIS dans un corps 200 : l'endpoint de suivi rejoue
 * l'échec en statut HTTP, exactement comme le faisait l'appel synchrone. Le
 * client garde donc un seul chemin d'erreur, et ses messages localisés par
 * `code`, sans savoir qu'un job est passé par là.
 */
export type BackgroundJobStatus<TResult> =
  | { state: Extract<BackgroundJobState, 'queued' | 'running' | 'unknown'>; job_id: string }
  | { state: 'done'; job_id: string; result: TResult }
