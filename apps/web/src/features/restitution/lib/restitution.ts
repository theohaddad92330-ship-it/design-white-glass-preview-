/**
 * Restitution après connexion ou import (#2080).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MOTIF DES TROIS ISSUES DE CE LOT (#2078/#2079/#2080)
 * ─────────────────────────────────────────────────────────────────────────────
 * On demandait de brancher un outil AVANT d'avoir montré ce que ça débloque, et
 * APRÈS l'avoir fait, rien ne disait ce qui avait changé. Ce fichier tient la
 * seconde moitié : ce que l'écran affiche une fois qu'une connexion ou un
 * import a produit quelque chose de RÉEL.
 *
 * ⚠️ Seuls les nombres mesurés entrent ici. `consultants` et
 * `withoutNextAction` sont `number | null` — `null` veut dire « pas mesuré à
 * cet endroit », jamais « zéro ». Afficher un panneau sur des données non
 * mesurées « 0 » referait exactement l'erreur que la doctrine du dépôt refuse.
 */

/** Les comptes que l'action vient de produire — la seule mesure garantie. */
export type RestitutionCounts = {
  created: number
  updated: number
}

/**
 * Y A-T-IL QUELQUE CHOSE À MONTRER ? — un panneau vide se lit comme un bug.
 *
 * Un import ou une connexion qui n'a RIEN produit (fichier vide, toutes les
 * lignes déjà connues sans un seul champ à compléter) ne mérite pas le
 * panneau « BellumAI ne repart pas de zéro » : il n'y a rien à montrer, et le
 * prétendre serait la même erreur que le zéro qui ment.
 */
export function hasRestitutionSignal(counts: RestitutionCounts): boolean {
  return counts.created > 0 || counts.updated > 0
}

/**
 * La phrase mesurée du §2080.9 (« 64 contacts, mais 37 sans prochaine
 * action ») — composée de DEUX nombres qui ne partagent pas la même source.
 *
 * `total` vient toujours de l'issue de l'écriture (créations + mises à jour) :
 * c'est un fait de l'import qui vient de s'exécuter. `withoutNextAction`
 * dépend d'une mesure que cet écran ne fait pas toujours : l'appelant la
 * passe quand il l'a, `null` sinon — et la seconde moitié de la phrase
 * disparaît plutôt que de se voir remplacée par un zéro qui prétendrait que
 * personne n'a de prochaine action.
 */
export function summaryPhraseCounts(
  counts: RestitutionCounts,
  withoutNextAction: number | null,
): { total: number; withoutNextAction: number | null } {
  return { total: counts.created + counts.updated, withoutNextAction }
}
