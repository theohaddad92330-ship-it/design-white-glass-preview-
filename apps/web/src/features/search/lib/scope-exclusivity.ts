/**
 * #4142 (retour bêta Louis 13/10) — audit de « Cadrer la collecte » :
 * `ScopeChipsField` dédoublonne déjà DANS un champ (à la casse près), mais
 * rien n'empêchait d'écrire le MÊME libellé dans deux champs opposés
 * (`included_entities`/`excluded_entities`, `selected_angles`/`excluded_angles`)
 * — « TF1 » à la fois prioritaire ET écarté, un cadrage contradictoire envoyé
 * tel quel au serveur. Le dernier champ coché gagne : un libellé qui vient
 * d'être ajouté ici disparaît du champ opposé.
 *
 * Ne touche QUE ce qui vient d'être ajouté par CE changement — un libellé
 * déjà partagé par les deux champs avant ce geste n'est pas corrigé sous le
 * pied de l'utilisateur (ce n'est pas lui qui vient de créer le doublon).
 */
export function removeNewlySharedLabels(
  otherList: readonly string[],
  previousList: readonly string[],
  nextList: readonly string[],
): string[] {
  const added = nextList.filter(value => !previousList.some(existing => existing.toLowerCase() === value.toLowerCase()))
  if (added.length === 0) return otherList as string[]
  const addedFolded = new Set(added.map(value => value.toLowerCase()))
  const filtered = otherList.filter(value => !addedFolded.has(value.toLowerCase()))
  return filtered.length === otherList.length ? (otherList as string[]) : filtered
}
