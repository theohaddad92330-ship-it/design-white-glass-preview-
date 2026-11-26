import type { TaceValue } from '@bellum/contracts'

/**
 * Alerte TACE : seulement si l'ESN a saisi un seuil ET que la valeur est
 * mesurée. Aucun seuil codé en dur ici — `threshold === null` éteint tout, et
 * une valeur « non mesurée » (`percent === null`) n'alerte jamais : l'absence
 * n'est pas un 0 %.
 */
export function isBelowTaceThreshold(value: TaceValue, threshold: number | null): boolean {
  if (threshold === null || value.percent === null) return false
  return value.percent < threshold
}

/** Part d'une barre, en pourcentage de la valeur maximale de la série (0 si la série est vide). */
export function barShare(value: number, max: number): number {
  if (!(max > 0) || !(value > 0)) return 0
  return Math.min(100, Math.round((value / max) * 100))
}

/** Lecture de saisie d'un seuil : `''` → null (éteint) ; hors 1-100 ou illisible → `invalid`. */
export function parseThresholdDraft(raw: string): { value: number | null; invalid: boolean } {
  const trimmed = raw.trim()
  if (trimmed === '') return { value: null, invalid: false }
  const parsed = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) return { value: null, invalid: true }
  return { value: parsed, invalid: false }
}
