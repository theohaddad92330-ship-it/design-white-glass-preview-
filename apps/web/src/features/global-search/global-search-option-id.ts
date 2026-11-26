/**
 * L'identifiant DOM d'une ligne de résultat — partagé entre `GlobalSearchDialog`
 * (qui le lit pour `aria-activedescendant`) et `GlobalSearchResultGroup` (qui le
 * pose sur le bouton). Préfixé par le groupe : deux entités de tables
 * différentes peuvent en théorie partager un identifiant, et
 * `aria-activedescendant` exige un id UNIQUE sur toute la page — un seul
 * endroit compose la règle plutôt que de la récrire aux deux appelants
 * (GA-26).
 */
export function globalSearchOptionId(groupKey: string, itemId: string): string {
  return `global-search-option-${groupKey}-${itemId}`
}
