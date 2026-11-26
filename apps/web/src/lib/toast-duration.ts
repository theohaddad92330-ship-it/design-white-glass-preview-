/**
 * Combien de temps un toast reste à l'écran (#1119).
 *
 * ── Le piège que ce fichier existe pour fermer ───────────────────────────
 *
 * « La notification ne disparaît pas. Soit on peut cliquer dessus avec une
 * croix […] soit ça disparaît tout seul. »
 *
 * `toast.loading()` de sonner est PERMANENT par construction — un chargement
 * n'a pas de durée connue. Quand on le remplace ensuite par son résultat en
 * réutilisant le même `id`, sonner **met à jour** le toast existant : tout
 * champ qu'on ne redonne pas est CONSERVÉ. Ne pas repasser `duration` conserve
 * donc l'infini du chargement, et le toast de succès reste à l'écran pour
 * toujours.
 *
 * Rien ne le signale : aucune erreur, aucun test rouge, un toast parfaitement
 * rendu. Le seul chemin qui s'effaçait correctement était celui des crédits
 * épuisés — le seul qui passait une `duration` explicite.
 *
 * **La règle : tout toast qui REMPLACE un chargement redonne sa durée.**
 * Gardée par `toast-duration.test.ts`.
 */

/** Une bonne nouvelle se lit vite. */
export const TOAST_SUCCESS_MS = 5_000

/**
 * Un échec ou un résultat vide se lit plus lentement : il y a une décision à
 * prendre derrière, et souvent une phrase d'explication à finir.
 */
export const TOAST_PROBLEM_MS = 8_000
