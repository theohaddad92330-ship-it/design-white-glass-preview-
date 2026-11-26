/**
 * Combien de noms un INDICATEUR a le droit d'énumérer.
 *
 * Un indicateur porte un chiffre ; les noms ne sont là que pour le rendre
 * concret (« 2/7 » ne dit pas où l'on est déjà entré). Au-delà de quelques
 * exemples, l'énumération cesse d'informer et devient un pavé : sur la fiche
 * d'un grand compte, la carte « Entités couvertes » déversait quarante noms en
 * prose et faisait huit fois la hauteur de ses trois voisines. Personne ne lit
 * quarante noms, et la grille ne s'en remet pas.
 */
const NAMES_SHOWN = 4

/**
 * Les premiers noms d'une liste, suivis du nombre de ceux qu'on n'affiche pas.
 *
 * Le reste n'est pas caché, il est COMPTÉ : « et 36 autres » se lit, « … » ne
 * se lit pas. L'ordre reçu est conservé — la source trie déjà du mieux couvert
 * au moins couvert, et re-trier ici mettrait en avant autre chose que ce que
 * l'appelant a choisi de mettre en avant.
 *
 * `formatRest` reçoit le nombre restant et rend le texte localisé ; le module
 * ne connaît aucune langue.
 */
export function namesSummary(names: readonly string[], formatRest: (count: number) => string): string {
  const clean = names.map(name => name.trim()).filter(Boolean)
  if (clean.length === 0) return ''
  const shown = clean.slice(0, NAMES_SHOWN)
  const rest = clean.length - shown.length
  return rest > 0 ? `${shown.join(', ')} ${formatRest(rest)}` : shown.join(', ')
}
