import { describe, expect, it } from 'vitest'
import { CONTACTS_TABLE_COLUMNS, CONTACTS_TABLE_SHELL } from './contactsTableColumns'

/**
 * #4503.3 — LE TABLEAU DES CONTACTS TIENT À 1 280 PX : ce test CALCULE les largeurs que le registre produit.
 *
 * jsdom ne mesure rien ; on ne rend donc pas, on fait ce que Chromium fait en `table-fixed` : largeur du tableau =
 * max(plancher `min-w`, conteneur), largeur de colonne = part × largeur du tableau. Le seul chiffre qui vient de l'écran
 * est le conteneur : 998 px à 1 280 px de fenêtre (prod 25/10/2026, `6bc31eb5e9`).
 *
 * AVANT : plancher `xl` 71 rem = 1 136 px → tableau 1 136 px, 138 px hors du conteneur, « Origine » hors champ.
 */
const REM = 16
const CONTAINER_AT_1280 = 998

function floorPx(band: 'md' | 'lg' | 'xl'): number {
  const found = CONTACTS_TABLE_SHELL.match(new RegExp(`(?<![\\w-])${band}:min-w-\\[(\\d+(?:\\.\\d+)?)rem\\]`))
  if (!found) throw new Error(`plancher ${band} introuvable`)
  return Number(found[1]) * REM
}

function xlShare(id: string): number {
  const column = CONTACTS_TABLE_COLUMNS.find(c => c.id === id)!
  return Number(column.className.match(/(?<![\w-])xl:w-\[(\d+(?:\.\d+)?)%\]/)![1])
}

/** La largeur du tableau et celle de chaque colonne à 1 280 px, comme `table-fixed` les calcule. */
function layoutAt1280() {
  const table = Math.max(floorPx('xl'), CONTAINER_AT_1280)
  const columns = Object.fromEntries(CONTACTS_TABLE_COLUMNS.map(c => [c.id, (xlShare(c.id) / 100) * table]))
  return { table, columns }
}

describe('#4503.3 — le tableau des contacts à 1 280 px', () => {
  it('ne dépasse pas son conteneur (APRÈS : 998 px, plancher 992 px — AVANT : 1 136 px)', () => {
    const { table } = layoutAt1280()
    expect(table).toBeLessThanOrEqual(CONTAINER_AT_1280)
    expect(floorPx('xl')).toBe(992)
  })

  it('la somme des cinq colonnes tient dans le conteneur, aucune n’est supprimée', () => {
    const { columns } = layoutAt1280()
    expect(Object.keys(columns)).toHaveLength(5)
    const sum = Object.values(columns).reduce((a, b) => a + b, 0)
    expect(sum).toBeLessThanOrEqual(CONTAINER_AT_1280 + 0.001)
  })

  it('l’e-mail garde sa largeur minimale (176 px) et « Origine » (commercial) est dans le champ', () => {
    const { columns, table } = layoutAt1280()
    expect(columns.contact).toBeGreaterThanOrEqual(11 * REM)
    expect(columns.commercial).toBeGreaterThanOrEqual(132) // « Mis à jour le JJ/MM/AAAA » (#3911.2)
    expect(
      columns.commercial! + columns.relation! + columns.contact! + columns.company! + columns.identity!,
    ).toBeLessThanOrEqual(table + 0.001)
  })

  it('dit NON : l’ancien plancher de 71 rem (1 136 px) déborderait de 138 px', () => {
    const old = Math.max(71 * REM, CONTAINER_AT_1280)
    expect(old).toBe(1136)
    expect(old).toBeGreaterThan(CONTAINER_AT_1280)
    expect(old - CONTAINER_AT_1280).toBe(138)
  })
})
