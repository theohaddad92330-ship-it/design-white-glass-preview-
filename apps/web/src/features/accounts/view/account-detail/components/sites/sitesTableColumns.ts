/**
 * #4612.2 — LES PARTS DE COLONNES DU TABLEAU DES SITES (jumeau de `entitiesTableColumns.ts`, #4327.2 / #4503.3).
 *
 * `SitesTable` était un `<Table>` NU : en disposition automatique, la ville ou la région la plus longue (cellules en
 * `truncate`, donc `nowrap`) commande la largeur du tableau, qui déborde de son conteneur à 1 280 px. Même geste que le
 * tableau des entités : `table-fixed`, chaque colonne déclare sa PART de la largeur (100 % en tout), aucun plancher.
 * Le texte se coupe dans sa cellule (ellipsis) ; la mise en page ne s'étire plus. Quatre colonnes, quatre parts.
 * jsdom ne mesure rien : `architecture/les-tableaux-entites-et-sites-tiennent-dans-leur-conteneur.test.ts` les garde.
 */
export const SITES_TABLE_SHELL = 'w-full table-fixed'

type SitesColumnId = 'city' | 'region' | 'type' | 'priority'

export const SITES_TABLE_COLUMNS: readonly { id: SitesColumnId; share: number; className: string }[] = [
  { id: 'city', share: 34, className: 'w-[34%]' },
  { id: 'region', share: 26, className: 'w-[26%]' },
  { id: 'type', share: 24, className: 'w-[24%]' },
  { id: 'priority', share: 16, className: 'w-[16%]' },
]

/** L'en-tête ET la cellule lisent la MÊME entrée : elles ne peuvent pas diverger. */
export function sitesColumnClass(id: SitesColumnId): string {
  const column = SITES_TABLE_COLUMNS.find(c => c.id === id)
  if (!column) throw new Error(`Colonne de sites inconnue : ${id}`)
  return column.className
}
