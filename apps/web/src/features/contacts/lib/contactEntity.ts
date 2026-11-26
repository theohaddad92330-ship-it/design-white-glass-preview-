/**
 * Vu en passant (lot R22, 07/10) — `contact.entity` est une déclaration LIBRE
 * (#2158.57, ILIKE comme `location`), jamais filtrée à l'écriture : un import
 * qui n'a pas pu la renseigner peut y avoir écrit le bruit littéral « N/A »
 * plutôt qu'un `null` propre (même motif que `isNoiseCity`, `siteGeo.ts`). Le
 * fil d'Ariane et la fiche affichaient alors ce bruit comme un nom d'entité.
 * Le filtre vit ici, une seule fois, à la LECTURE.
 */
function isUsableEntity(entity: string | null): entity is string {
  if (!entity) return false
  const lower = entity.trim().toLowerCase()
  return lower.length > 0 && lower !== 'n/a' && lower !== 'non identifié' && lower !== 'non identifie' && lower !== '-'
}

/** L'entité déclarée, ou `null` quand elle est absente ou du bruit — jamais
 *  « N/A » rendu tel quel (doctrine : une valeur absente ne s'affiche pas). */
export function cleanEntity(entity: string | null): string | null {
  return isUsableEntity(entity) ? entity : null
}

/** Faut-il charger le compte associé en repli : seulement quand l'entité
 *  déclarée ne suffit pas (#1473) — jamais une requête systématique. */
export function needsAccountFallback(entity: string | null): boolean {
  return !isUsableEntity(entity)
}

/**
 * Le libellé du maillon « compte » : l'entité déclarée quand elle est
 * utilisable ; sinon le nom du compte associé (« on prend le compte associé »,
 * jamais ce qu'on n'a pas) ; sinon seulement le libellé générique de repli.
 */
export function accountCrumbLabel(
  entity: string | null,
  accountCompanyName: string | null,
  genericFallback: string,
): string {
  return cleanEntity(entity) ?? accountCompanyName ?? genericFallback
}
