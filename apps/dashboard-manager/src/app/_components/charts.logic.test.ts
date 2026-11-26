import { describe, expect, it } from 'vitest'
import {
  MAX_SERIES,
  buildCohortGrid,
  clampSeries,
  computeAxisMax,
  computeLineRuns,
  computeStackedColumns,
  computeWaterfall,
} from './charts.logic'

// ── LineChart ────────────────────────────────────────────────────────────

describe('computeLineRuns — le cas de test n°1 de #1643', () => {
  it('un mois sans donnée est un TROU dans la ligne, jamais une interpolation', () => {
    // jan, fév, mars(absent), avr, mai
    const values = [10, 12, null, 8, 14]
    const runs = computeLineRuns(values, { width: 100, height: 40, pad: 4, max: 14 })

    expect(runs).toHaveLength(2) // deux tronçons, PAS un seul continu
    expect(runs[0]?.map(p => p.index)).toEqual([0, 1])
    expect(runs[1]?.map(p => p.index)).toEqual([3, 4])
    // Rien n'a été inventé pour combler le trou : mars n'apparaît dans AUCUN run.
    expect(runs.flat().some(p => p.index === 2)).toBe(false)
  })

  it('LIT quelque chose — une série complète produit UN seul run de N points', () => {
    const runs = computeLineRuns([1, 2, 3], { width: 100, height: 40, pad: 4, max: 3 })
    expect(runs).toHaveLength(1)
    expect(runs[0]).toHaveLength(3)
  })

  it('sait dire NON — une série entièrement absente ne rend aucun run, sans crash', () => {
    const runs = computeLineRuns([null, null, null], { width: 100, height: 40, pad: 4, max: 1 })
    expect(runs).toEqual([])
  })

  it('un trou en tête ou en fin de série ne produit pas de point fantôme', () => {
    const runs = computeLineRuns([null, 5, 6, null], { width: 100, height: 40, pad: 4, max: 6 })
    expect(runs).toHaveLength(1)
    expect(runs[0]?.map(p => p.index)).toEqual([1, 2])
  })

  it('n’attrape pas ce qu’elle ne vise pas — deux trous consécutifs restent un seul vide, pas deux runs fantômes', () => {
    const runs = computeLineRuns([1, null, null, 4], { width: 100, height: 40, pad: 4, max: 4 })
    expect(runs).toHaveLength(2)
    expect(runs[0]).toHaveLength(1)
    expect(runs[1]).toHaveLength(1)
  })

  it('les coordonnées Y respectent le sens SVG (0 en haut) : la plus grande valeur a le plus petit y', () => {
    const runs = computeLineRuns([1, 10], { width: 100, height: 40, pad: 0, max: 10 })
    const [p0, p1] = runs[0] ?? []
    expect(p1!.y).toBeLessThan(p0!.y)
  })
})

describe('computeAxisMax — échelle Y partagée entre séries', () => {
  it('ignore les trous — un trou ne peut pas écraser l’échelle', () => {
    expect(
      computeAxisMax([
        [1, null, 3],
        [null, 20, null],
      ]),
    ).toBe(20)
  })

  it('sait dire NON — toutes séries vides/absentes rendent un plancher de 1, jamais 0 (division par zéro évitée en aval)', () => {
    expect(computeAxisMax([[null, null], []])).toBe(1)
  })
})

describe('clampSeries — « Maximum 5 séries par graphique »', () => {
  it('tronque au-delà de 5', () => {
    const series = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    expect(clampSeries(series)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(MAX_SERIES).toBe(5)
  })

  it('n’attrape pas ce qu’elle ne vise pas — laisse passer 5 séries ou moins intactes', () => {
    expect(clampSeries(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })
})

// ── StackedBar ───────────────────────────────────────────────────────────

describe('computeStackedColumns — décomposition du MRR', () => {
  const keys = ['new', 'expansion', 'churn']

  it('LIT quelque chose — empile les séries connues et somme le total', () => {
    const [col] = computeStackedColumns([{ label: 'Jan', values: { new: 10, expansion: 5, churn: -2 } }], keys)
    expect(col?.total).toBe(13)
    expect(col?.segments.map(s => s.key)).toEqual(['new', 'expansion', 'churn'])
    expect(col?.segments[2]).toMatchObject({ value: -2, y0: 15, y1: 13 })
  })

  it('sait dire NON — une catégorie entièrement non mesurée n’a pas de barre à 0, elle est `total: null`', () => {
    const [col] = computeStackedColumns([{ label: 'Fév', values: { new: null, expansion: null, churn: null } }], keys)
    expect(col).toEqual({ label: 'Fév', segments: [], total: null })
  })

  it('une série absente pour UNE catégorie est EXCLUE de la pile, pas comptée comme 0', () => {
    const [col] = computeStackedColumns([{ label: 'Mars', values: { new: 10, expansion: null, churn: -3 } }], keys)
    expect(col?.segments.map(s => s.key)).toEqual(['new', 'churn'])
    expect(col?.total).toBe(7)
  })
})

// ── WaterfallChart ─────────────────────────────────────────────────────────

describe('computeWaterfall — nouveau MRR = début + new + expansion − contraction − churn', () => {
  it('LIT quelque chose — enchaîne les étapes sur le total courant', () => {
    const bars = computeWaterfall([
      { label: 'Début', kind: 'start', value: 100 },
      { label: 'New', kind: 'delta', value: 20 },
      { label: 'Expansion', kind: 'delta', value: 10 },
      { label: 'Contraction', kind: 'delta', value: -5 },
      { label: 'Churn', kind: 'delta', value: -8 },
      { label: 'Fin', kind: 'end', value: 117 },
    ])
    expect(bars).toHaveLength(6)
    expect(bars[0]).toMatchObject({ y0: 0, y1: 100, tone: 'neutral' })
    expect(bars[1]).toMatchObject({ y0: 100, y1: 120, tone: 'positive' })
    expect(bars[2]).toMatchObject({ y0: 120, y1: 130, tone: 'positive' })
    expect(bars[3]).toMatchObject({ y0: 125, y1: 130, tone: 'negative' })
    expect(bars[4]).toMatchObject({ y0: 117, y1: 125, tone: 'negative' })
    expect(bars[5]).toMatchObject({ y0: 0, y1: 117, tone: 'neutral' })
  })

  it('sait dire NON — une étape non mesurée ne dessine pas de barre ET ne fait PAS avancer le total', () => {
    const bars = computeWaterfall([
      { label: 'Début', kind: 'start', value: 100 },
      { label: 'New', kind: 'delta', value: null },
      { label: 'Expansion', kind: 'delta', value: 10 },
    ])
    expect(bars[1]).toMatchObject({ y0: 100, y1: 100, value: null, tone: 'unknown' })
    // La barre suivante repart du total D'AVANT l'étape manquante, jamais 0 deviné à sa place.
    expect(bars[2]).toMatchObject({ y0: 100, y1: 110, tone: 'positive' })
  })

  it('n’attrape pas ce qu’elle ne vise pas — un delta positif ET négatif sont tous deux orientés y0 < y1', () => {
    const bars = computeWaterfall([
      { label: 'Début', kind: 'start', value: 50 },
      { label: 'Hausse', kind: 'delta', value: 5 },
      { label: 'Baisse', kind: 'delta', value: -5 },
    ])
    for (const b of bars.slice(1)) {
      expect(b.y0).toBeLessThanOrEqual(b.y1)
    }
  })
})

// ── CohortGrid ───────────────────────────────────────────────────────────

describe('buildCohortGrid — rétention par cohorte mensuelle', () => {
  it('sait dire NON — une cohorte de MOINS de 3 espaces n’est pas affichée (anonymat)', () => {
    const grid = buildCohortGrid([{ cohortLabel: 'Jan', spaceCount: 2, retentionByMonth: [1, 0.9] }], () => 11)
    expect(grid).toEqual([null])
  })

  it('une cohorte de PILE 3 espaces reste affichée — « moins de 3 » exclut 2, pas 3', () => {
    const grid = buildCohortGrid([{ cohortLabel: 'Jan', spaceCount: 3, retentionByMonth: [1] }], () => 0)
    expect(grid[0]).not.toBeNull()
  })

  it('LIT quelque chose — produit toujours 12 colonnes', () => {
    const grid = buildCohortGrid([{ cohortLabel: 'Jan', spaceCount: 10, retentionByMonth: [1] }], () => 0)
    expect(grid[0]?.cells).toHaveLength(12)
  })

  it('les cellules FUTURES sont VIDES, pas 0 — distinctes d’un mois déjà écoulé mais non mesuré', () => {
    // Cohorte démarrée il y a 2 mois : les mois 0 et 1 sont dans la fenêtre, 2..11 sont futurs.
    const grid = buildCohortGrid([{ cohortLabel: 'Août', spaceCount: 5, retentionByMonth: [1, 0.8] }], () => 1)
    const cells = grid[0]?.cells ?? []
    expect(cells[0]).toEqual({ value: 1, state: 'measured' })
    expect(cells[1]).toEqual({ value: 0.8, state: 'measured' })
    expect(cells[2]).toEqual({ value: null, state: 'future' })
    expect(cells[11]).toEqual({ value: null, state: 'future' })
  })

  it('un mois déjà écoulé mais sans donnée est `unmeasured`, distinct d’un mois futur', () => {
    // La fenêtre écoulée couvre les mois 0..2 ; seul le mois 0 a une donnée.
    const grid = buildCohortGrid([{ cohortLabel: 'Juil', spaceCount: 5, retentionByMonth: [1] }], () => 2)
    const cells = grid[0]?.cells ?? []
    expect(cells[0]).toEqual({ value: 1, state: 'measured' })
    expect(cells[1]).toEqual({ value: null, state: 'unmeasured' }) // écoulé, donnée manquante
    expect(cells[2]).toEqual({ value: null, state: 'unmeasured' }) // écoulé aussi, donnée manquante
    expect(cells[3]).toEqual({ value: null, state: 'future' }) // hors fenêtre écoulée
  })
})
