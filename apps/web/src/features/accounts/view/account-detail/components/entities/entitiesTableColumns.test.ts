import { describe, expect, it } from 'vitest'
import { ENTITIES_TABLE_COLUMNS, ENTITIES_TABLE_SHELL } from './entitiesTableColumns'

/**
 * #4327.2 — LE TABLEAU DES ENTITÉS TIENT DANS SON CONTENEUR (1 000 px à 1 280 px de fenêtre).
 * Même méthode que `contactsTableColumns.layout.test.ts` : jsdom ne mesure rien, on CALCULE ce que `table-fixed` produit.
 * AVANT : 1 244 px (APAVE 1 242 px) dans 1 000 px, la colonne « Actions » n'était atteignable qu'au défilement.
 */
const CONTAINER = 1000

function floorPx(): number {
  const found = ENTITIES_TABLE_SHELL.match(/(?<![\w-])min-w-\[(\d+(?:\.\d+)?)rem\]/)
  return found ? Number(found[1]) * 16 : 0
}

describe('#4327.2 — le tableau des entités à 1 280 px', () => {
  it('est en table-fixed et ne dépasse pas son conteneur de 1 000 px', () => {
    expect(ENTITIES_TABLE_SHELL).toContain('table-fixed')
    expect(Math.max(floorPx(), CONTAINER)).toBeLessThanOrEqual(CONTAINER)
  })
  it('les parts font 100 % et les cinq colonnes sont gardées', () => {
    expect(ENTITIES_TABLE_COLUMNS).toHaveLength(5)
    expect(ENTITIES_TABLE_COLUMNS.reduce((sum, c) => sum + c.share, 0)).toBe(100)
  })
})
