// #1642 — Heatmap : « grille jour × heure, 5 intensités — le motif Metric
// Flow ». La quantification en 5 paliers et le domaine (min/max connus) sont
// les deux décisions pures : une cellule non mesurée reste `null`, jamais le
// palier 0 (qui est un VRAI minimum mesuré, pas une absence).

export type Intensity = 0 | 1 | 2 | 3 | 4

/**
 * Domaine [min, max] des valeurs CONNUES. `null` s'il n'y a aucune valeur
 * mesurée — un domaine 0..0 inventé peindrait toute la grille au palier 0.
 */
export function intensityDomain(values: ReadonlyArray<number | null | undefined>): { min: number; max: number } | null {
  const known = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (known.length === 0) return null
  return { min: Math.min(...known), max: Math.max(...known) }
}

export function computeIntensity(value: number | null | undefined, min: number, max: number): Intensity | null {
  if (value == null || !Number.isFinite(value)) return null
  // Toutes les valeurs connues sont égales : rien ne les distingue, palier
  // plancher plutôt qu'une division par zéro.
  if (max <= min) return 0
  const ratio = Math.min(1, Math.max(0, (value - min) / (max - min)))
  return Math.min(4, Math.floor(ratio * 5)) as Intensity
}
