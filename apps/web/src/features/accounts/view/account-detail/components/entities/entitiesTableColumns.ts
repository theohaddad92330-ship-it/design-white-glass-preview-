/**
 * #4327.2 — LES PARTS DE COLONNES DU TABLEAU DES ENTITÉS (porté de `contactsTableColumns.ts`, #2465 / #4503.3).
 *
 * Mesuré en production le 26/10 (`38e9fc6e8a`, fenêtre 1 280 px) : le tableau faisait 1 244 px dans un conteneur de
 * 1 000 px (APAVE 1 242 px) — « Actions » n'était atteignable qu'au défilement horizontal. La cause est la même que sur
 * `/contacts` : en disposition automatique, c'est la donnée la plus longue (cellules `text-nowrap`) qui commande.
 *
 * Même geste : `table-fixed`, chaque colonne déclare sa PART de la largeur (100 % en tout), aucun plancher en `rem`.
 * Le texte se coupe à la ligne ; la mise en page ne s'étire plus. Rien n'est retiré : cinq colonnes, cinq parts.
 * jsdom ne mesure rien : `entitiesTableColumns.test.ts` calcule ce que `table-fixed` produit.
 */
export const ENTITIES_TABLE_SHELL = 'w-full table-fixed'

type EntitiesColumnId = 'entity' | 'location' | 'potential' | 'siteCount' | 'actions'

export const ENTITIES_TABLE_COLUMNS: readonly { id: EntitiesColumnId; share: number; className: string }[] = [
  { id: 'entity', share: 40, className: 'w-[40%]' },
  { id: 'location', share: 16, className: 'w-[16%]' },
  { id: 'potential', share: 12, className: 'w-[12%]' },
  { id: 'siteCount', share: 8, className: 'w-[8%]' },
  { id: 'actions', share: 24, className: 'w-[24%]' },
]

/** L'en-tête ET la cellule lisent la MÊME entrée : elles ne peuvent pas diverger. */
export function entitiesColumnClass(id: EntitiesColumnId): string {
  const column = ENTITIES_TABLE_COLUMNS.find(c => c.id === id)
  if (!column) throw new Error(`Colonne d'entités inconnue : ${id}`)
  return column.className
}
