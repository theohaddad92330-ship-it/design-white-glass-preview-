/**
 * Les deux constantes partagées par les sept groupes de la recherche globale
 * (#2207.67-74, épopée #3015). Un réglage vit à un seul endroit (GA-26).
 */

/** Le plancher de saisie avant de lancer une requête. Sous deux caractères,
 *  une lettre isolée déclencherait une requête réseau à chaque frappe pour un
 *  résultat qui ne peut être que du bruit. */
export const GLOBAL_SEARCH_MIN_QUERY_LENGTH = 2

/** Le nombre de lignes par groupe — une VUE D'ENSEMBLE, pas la liste
 *  complète : chaque groupe mène à l'écran qui, lui, n'est pas borné. */
export const GLOBAL_SEARCH_RESULT_LIMIT = 5
