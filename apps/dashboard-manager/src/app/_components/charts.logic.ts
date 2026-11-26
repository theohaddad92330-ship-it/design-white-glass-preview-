// #1643 — la DÉCISION de chaque graphique nouveau, en fonctions pures,
// testées exhaustivement (l'environnement de test du manager est `node`, pas
// jsdom : c'est ici, pas dans le rendu SVG, que vivent les vrais défauts).
//
// La règle qui gouverne tout ce fichier, verbatim de #1643 : « Aucune valeur
// inventée entre deux points : pas d'interpolation lissée sur des données
// mensuelles. Un point manquant est un TROU visible, pas une ligne droite. »

export type SeriesPoint = { label: string; value: number | null }

/** « Maximum 5 séries par graphique » (#1643) — une troncature EXPLICITE plutôt qu'un rendu illisible. */
export const MAX_SERIES = 5

export function clampSeries<T>(series: readonly T[]): T[] {
  return series.slice(0, MAX_SERIES)
}

// ── LineChart ────────────────────────────────────────────────────────────

export type LinePoint = { x: number; y: number; index: number; value: number }

/**
 * L'échelle Y est PARTAGÉE entre séries (comparaison multi-séries honnête) ;
 * elle ignore les points manquants — un trou ne doit pas écraser l'échelle.
 */
export function computeAxisMax(seriesValues: ReadonlyArray<ReadonlyArray<number | null>>): number {
  const known = seriesValues.flat().filter((v): v is number => v != null && Number.isFinite(v))
  return known.length ? Math.max(1, ...known) : 1
}

/**
 * Découpe une série en RUNS — groupes de points consécutifs mesurés. Un
 * point manquant (`null`/non fini) termine le run courant sans le relier au
 * suivant : c'est le cas de test n°1 de #1643, « un mois sans donnée → trou
 * dans la ligne, jamais une interpolation ».
 */
export function computeLineRuns(
  values: ReadonlyArray<number | null>,
  opts: { width: number; height: number; pad: number; max: number },
): LinePoint[][] {
  const { width, height, pad, max } = opts
  const n = values.length
  const xOf = (i: number): number => (n > 1 ? (i / (n - 1)) * width : width / 2)
  const yOf = (v: number): number => height - pad - (v / max) * (height - 2 * pad)

  const runs: LinePoint[][] = []
  let current: LinePoint[] = []
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v == null || !Number.isFinite(v)) {
      if (current.length) runs.push(current)
      current = []
      continue
    }
    current.push({ x: xOf(i), y: yOf(v), index: i, value: v })
  }
  if (current.length) runs.push(current)
  return runs
}

// ── StackedBar ───────────────────────────────────────────────────────────

export type StackedCategory = { label: string; values: Readonly<Record<string, number | null>> }
export type StackedSegment = { key: string; value: number; y0: number; y1: number }
export type StackedColumn = { label: string; segments: StackedSegment[]; total: number | null }

/**
 * Empile les séries CONNUES d'une catégorie. Une série absente pour une
 * catégorie est EXCLUE de la pile (pas comptée comme 0) ; si TOUTES les
 * séries d'une catégorie sont absentes, la colonne entière est non mesurée
 * (`total: null`, aucun segment) plutôt qu'une barre à hauteur 0 qui
 * prétendrait un MRR nul.
 */
export function computeStackedColumns(
  categories: readonly StackedCategory[],
  keys: readonly string[],
): StackedColumn[] {
  return categories.map(cat => {
    const known = keys
      .map((k): [string, number | null] => [k, cat.values[k] ?? null])
      .filter((entry): entry is [string, number] => entry[1] != null && Number.isFinite(entry[1]))

    if (known.length === 0) return { label: cat.label, segments: [], total: null }

    let y0 = 0
    const segments = known.map(([key, value]) => {
      const seg = { key, value, y0, y1: y0 + value }
      y0 += value
      return seg
    })
    return { label: cat.label, segments, total: y0 }
  })
}

// ── WaterfallChart ───────────────────────────────────────────────────────

export type WaterfallStepKind = 'start' | 'delta' | 'end'
export type WaterfallStep = { label: string; kind: WaterfallStepKind; value: number | null }
export type WaterfallTone = 'positive' | 'negative' | 'neutral' | 'unknown'
export type WaterfallBar = {
  label: string
  kind: WaterfallStepKind
  y0: number
  y1: number
  value: number | null
  tone: WaterfallTone
}

/**
 * « nouveau MRR = début + new + expansion − contraction − churn » : chaque
 * étape flotte sur le total COURANT. Une étape non mesurée ne dessine pas de
 * barre (`y0 === y1`) et NE FAIT PAS AVANCER le total — la deviner à 0 ferait
 * silencieusement décaler toutes les barres suivantes d'un montant inventé.
 */
export function computeWaterfall(steps: readonly WaterfallStep[]): WaterfallBar[] {
  let running = 0
  const bars: WaterfallBar[] = []

  for (const step of steps) {
    if (step.value == null || !Number.isFinite(step.value)) {
      bars.push({ label: step.label, kind: step.kind, y0: running, y1: running, value: null, tone: 'unknown' })
      continue
    }

    if (step.kind === 'start' || step.kind === 'end') {
      bars.push({ label: step.label, kind: step.kind, y0: 0, y1: step.value, value: step.value, tone: 'neutral' })
      running = step.value
    } else {
      const y0 = running
      const y1 = running + step.value
      bars.push({
        label: step.label,
        kind: step.kind,
        y0: Math.min(y0, y1),
        y1: Math.max(y0, y1),
        value: step.value,
        tone: step.value >= 0 ? 'positive' : 'negative',
      })
      running = y1
    }
  }

  return bars
}

// ── CohortGrid ───────────────────────────────────────────────────────────

export const COHORT_MONTHS = 12
export const COHORT_MIN_SPACES = 3

export type CohortRow = { cohortLabel: string; spaceCount: number; retentionByMonth: ReadonlyArray<number | null> }
export type CohortCellState = 'measured' | 'future' | 'unmeasured'
export type CohortCell = { value: number | null; state: CohortCellState }
export type CohortGridRow = { cohortLabel: string; cells: CohortCell[] }

/**
 * « cohorte de moins de 3 espaces PAS affichée (anonymat) » → `null` (ligne
 * retirée). « cellules futures VIDES, pas 0 » → `state: 'future'`, distinct
 * d'une cellule dans la fenêtre déjà écoulée mais dont la donnée manque
 * (`state: 'unmeasured'`) : les deux sont vides à l'écran, mais pas pour la
 * même raison, et la légende ne doit pas les confondre.
 */
export function buildCohortGrid(
  rows: readonly CohortRow[],
  monthsElapsed: (row: CohortRow) => number,
): Array<CohortGridRow | null> {
  return rows.map(row => {
    if (row.spaceCount < COHORT_MIN_SPACES) return null

    const elapsed = monthsElapsed(row)
    const cells: CohortCell[] = []
    for (let m = 0; m < COHORT_MONTHS; m++) {
      if (m > elapsed) {
        cells.push({ value: null, state: 'future' })
        continue
      }
      const v = row.retentionByMonth[m] ?? null
      cells.push(v == null ? { value: null, state: 'unmeasured' } : { value: v, state: 'measured' })
    }
    return { cohortLabel: row.cohortLabel, cells }
  })
}
