import { describe, expect, it } from 'vitest'
import { VIVIER_REQUIRED_COLUMNS, VIVIER_TABLE_COLUMNS, vivierColumnsFor } from './vivierTableColumns'

/**
 * #2737 — LES COLONNES SE CHOISISSENT SUR LA LARGEUR DU CONTENEUR.
 *
 * Rouverte le 25/09/2026 : à ~830 px de conteneur, treize colonnes en parts
 * de pourcentage laissaient 3 % à « Complétude » — l'en-tête se coupait
 * lettre par lettre et « 20/100 » débordait sur la voisine. Une part ne
 * garantit RIEN contre la largeur d'un contenu ; un plancher en pixels, oui.
 */
describe('vivierColumnsFor — colonnes priorisées par la largeur du conteneur (#2737)', () => {
  const ids = (width: number) => vivierColumnsFor(width).map(column => column.id)

  it('garde toujours le nom, la disponibilité, les compétences et les actions', () => {
    for (const width of [320, 594, 794, 974, 1206, 2400]) {
      for (const id of VIVIER_REQUIRED_COLUMNS) expect(ids(width), `${id} @ ${width}`).toContain(id)
    }
  })

  it('ajoute les colonnes dans l’ordre de leur priorité, jamais une moins prioritaire avant', () => {
    const byRank = [...VIVIER_TABLE_COLUMNS].sort((a, b) => a.rank - b.rank).map(column => column.id)
    let previous = 0
    for (let width = 400; width <= 2400; width += 20) {
      const shown = ids(width)
      expect(shown.length).toBeGreaterThanOrEqual(previous)
      previous = shown.length
      const expected = byRank.slice(0, shown.length)
      expect([...shown].sort(), `${width} px`).toEqual([...expected].sort())
    }
  })

  it('ne donne jamais à une colonne moins que son plancher dès que les obligatoires tiennent', () => {
    const requiredFloor = VIVIER_TABLE_COLUMNS.filter(column => VIVIER_REQUIRED_COLUMNS.includes(column.id)).reduce(
      (sum, column) => sum + column.minPx,
      0,
    )
    for (let width = requiredFloor; width <= 2400; width += 37) {
      for (const column of vivierColumnsFor(width)) {
        const floor = VIVIER_TABLE_COLUMNS.find(entry => entry.id === column.id)?.minPx ?? 0
        expect(column.widthPx, `${column.id} @ ${width}`).toBeGreaterThanOrEqual(floor - 0.5)
      }
    }
  })

  it('remplit exactement le conteneur — ni débordement, ni reste', () => {
    for (const width of [320, 594, 794, 974, 1206, 1800]) {
      const total = vivierColumnsFor(width).reduce((sum, column) => sum + column.widthPx, 0)
      expect(Math.abs(total - width), `${width} px`).toBeLessThan(0.5)
    }
  })

  it('les actions gardent leur plancher même quand le conteneur est plus étroit que le minimum', () => {
    const actions = vivierColumnsFor(460).find(column => column.id === 'actions')
    expect(actions?.widthPx).toBeGreaterThanOrEqual(
      VIVIER_TABLE_COLUMNS.find(column => column.id === 'actions')?.minPx ?? Infinity,
    )
  })

  it('sans mesure (0 px, jsdom), rend toutes les colonnes dans l’ordre d’affichage', () => {
    expect(ids(0)).toEqual(VIVIER_TABLE_COLUMNS.map(column => column.id))
  })

  it('mesuré à 1 206 px (1 512 de fenêtre), montre plus que les colonnes obligatoires', () => {
    // Cinq colonnes + le geste (Théo C talents-vivier.R3) : à 1 206 px elles tiennent toutes.
    expect(ids(1206).length).toBeGreaterThan(VIVIER_REQUIRED_COLUMNS.length)
  })
})
