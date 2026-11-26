import type { HeadcountRange } from './discover-types'

/**
 * #4362.3 — LA définition de la taille d'une entreprise dans Découvrir, un seul endroit (GA-26).
 * Définition BellumAI (décision Louis 21/10/2026) : TPE < 10 salariés · PME 10-249 · ETI 250-999 ·
 * GC (grand compte) ≥ 1 000. Le rail, les préréglages et les cartes la lisent ici ; côté IA, les
 * mêmes bornes vivent dans `discover_scoring.py` (constantes nommées, testées).
 */
export type SizeBandCode = 'TPE' | 'PME' | 'ETI' | 'GC'

export interface SizeBand {
  code: SizeBandCode
  min: number
  /** `null` = pas de borne haute (grand compte). */
  max: number | null
  /** Les tranches fines qui composent la taille — l'affinage DU MÊME filtre. */
  ranges: readonly Exclude<HeadcountRange, 'any' | '250-4999'>[]
}

export const SIZE_BANDS: readonly SizeBand[] = [
  { code: 'TPE', min: 1, max: 9, ranges: ['1-9'] },
  { code: 'PME', min: 10, max: 249, ranges: ['10-49', '50-249'] },
  { code: 'ETI', min: 250, max: 999, ranges: ['250-999'] },
  { code: 'GC', min: 1000, max: null, ranges: ['1000+'] },
]

/** Le préréglage « Startup » : moins de 250 salariés, écrit en tranches VISIBLES au rail (TPE + PME). */
export const STARTUP_SEGMENT_HEADCOUNT: readonly HeadcountRange[] = ['1-9', '10-49', '50-249']

/**
 * L'ancienne « catégorie officielle » (INSEE : PME < 250, ETI 250-4 999, GE ≥ 5 000) devient des TRANCHES —
 * l'intention est gardée (ETI inclut ce qui est aujourd'hui GC), la catégorie est vidée. Les presque-égalités
 * se règlent en faveur de l'ancien périmètre : on élargit d'un cran, on ne perd jamais de résultats voulus.
 */
const LEGACY_CATEGORY_RANGES: Record<string, readonly HeadcountRange[]> = {
  PME: ['1-9', '10-49', '50-249'],
  ETI: ['250-999', '1000+'],
  GE: ['1000+'],
}

const RANGE_ORDER: readonly HeadcountRange[] = ['1-9', '10-49', '50-249', '250-999', '1000+', '250-4999']

export function migrateLegacySize<T extends { headcount: HeadcountRange[]; companyCategory: string[] }>(filters: T): T {
  if (filters.companyCategory.length === 0) return filters
  const merged = new Set<HeadcountRange>(filters.headcount)
  for (const code of filters.companyCategory) {
    for (const range of LEGACY_CATEGORY_RANGES[code.toUpperCase()] ?? []) merged.add(range)
  }
  const headcount = [...merged].sort((a, b) => RANGE_ORDER.indexOf(a) - RANGE_ORDER.indexOf(b))
  return { ...filters, headcount, companyCategory: [] }
}
