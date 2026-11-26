/**
 * #4759 (HIST-E) — LES BORNES DE L'OUTIL « HISTORIQUE DES BESOINS » DE LAURA, À UN SEUL ENDROIT (GA-26).
 *
 * Louis (28/10/2026) : Laura doit pouvoir tout atteindre sans que tout entre dans son contexte. L'outil
 * de requête tient les deux : l'agrégat borné entre dans le contexte, l'historique complet se lit PAR
 * PAGES. « Pertinence avant le coût » (25/10) : ces plafonds bornent la taille d'un appel et leur nombre
 * par tour — jamais le refus d'appeler. Les journaliser (`needs_history.query`) permet de les relever
 * si Laura bute dessus, au lieu de le deviner.
 */

/** Lignes rendues par UN appel de l'outil, au maximum. Au-delà : page suivante (`offset`). */
export const NEEDS_HISTORY_MAX_ROWS_PER_CALL = 25

/** Lignes par appel quand Laura ne demande rien. */
export const NEEDS_HISTORY_DEFAULT_ROWS_PER_CALL = 10

/** Appels de l'outil par TOUR de Laura, au maximum (lu par le côté IA qui déclare l'outil). */
export const NEEDS_HISTORY_MAX_CALLS_PER_TURN = 6

/** Technos dominantes rendues dans l'agrégat du contexte. */
export const NEEDS_HISTORY_AGGREGATE_TOP_TECHS = 3

/** Lignes d'historique (`signal_history`) relues par compte avant filtre — borne la lecture, pas la réponse. */
export const NEEDS_HISTORY_SOURCE_ROWS_PER_ACCOUNT = 500
