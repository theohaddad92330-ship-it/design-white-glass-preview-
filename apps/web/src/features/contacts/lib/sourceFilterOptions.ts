import { contactSourceSchema, MON_CRM_SOURCE_FILTER } from '@bellum/contracts'
import { contactSourceLabel } from './contactProvenance'

/**
 * #4526.9 — les options du filtre « Source » du Répertoire. « Mon CRM » n'y figure que s'il rend au moins un
 * contact (ou s'il est déjà posé : il faut pouvoir le relâcher) — une option qui ouvre « Aucun contact avec ces
 * critères » est une absence présentée comme un choix. Son libellé est celui de la puce (GA-26).
 */
export function sourceFilterOptions(monCrm: { label: string; shown: boolean }): { value: string; label: string }[] {
  return [
    ...contactSourceSchema.options.map(source => ({ value: source, label: contactSourceLabel(source) })),
    ...(monCrm.shown ? [{ value: MON_CRM_SOURCE_FILTER, label: monCrm.label }] : []),
  ]
}
