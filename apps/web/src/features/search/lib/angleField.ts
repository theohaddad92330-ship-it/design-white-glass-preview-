import type { AnalysisContext, AnalysisContextPreset } from '@bellum/contracts'

/**
 * « Ton angle, en une phrase » (refonte Théo R1) — UNE zone de texte pour tous les objectifs.
 *
 * Le contexte d'analyse est une union discriminée : chaque preset a ses propres champs, et seul
 * `free` porte des `notes`. La phrase de l'angle ne crée donc pas de champ neuf : elle s'écrit
 * dans le champ TEXTE LIBRE le plus proche de chaque preset — celui que le serveur lit déjà.
 * Changer d'objectif ne perd pas la phrase (elle est reportée dans le nouveau contexte).
 */
const ANGLE_FIELD_BY_PRESET: Record<AnalysisContextPreset, string> = {
  free: 'notes',
  strategic: 'prioritizationReason',
  'known-account': 'openOpportunity',
  incumbent: 'weakness',
  signal: 'implication',
  'push-offer': 'differentiation',
  retry: 'hypothesis',
}

/** Le nom du champ qui porte la phrase d'angle pour ce preset. */
export function angleKeyOf(preset: AnalysisContextPreset): string {
  return ANGLE_FIELD_BY_PRESET[preset]
}

/** La phrase d'angle portée par le contexte, ou `''`. */
export function angleOf(context: AnalysisContext): string {
  const value = (context as Record<string, unknown>)[ANGLE_FIELD_BY_PRESET[context.preset]]
  return typeof value === 'string' ? value : ''
}

/** Le même contexte avec la phrase d'angle posée dans son champ texte. */
export function withAngle(context: AnalysisContext, angle: string): AnalysisContext {
  return { ...context, [ANGLE_FIELD_BY_PRESET[context.preset]]: angle } as AnalysisContext
}
