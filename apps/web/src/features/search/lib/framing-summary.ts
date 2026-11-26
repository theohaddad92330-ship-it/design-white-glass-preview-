import type { AnalysisGeoPerimeter, AnalysisScopeSelection } from '@bellum/contracts'

/**
 * Théo B r1-recherche.R7 — ce que le bouton « Périmètre » résume : la zone, les zones saisies, le nombre d'entités
 * ciblées et exclues. Des comptes bruts : c'est l'écran qui les met en phrase (pluriels i18n) et qui TAIT un compte à
 * zéro — « 0 entité exclue » se lirait comme un réglage posé alors que rien ne l'est.
 */
export function perimeterSummaryParts(selection: AnalysisScopeSelection): {
  zone: AnalysisGeoPerimeter | undefined
  areas: string[]
  included: number
  excluded: number
} {
  return {
    zone: selection.geo_perimeter,
    areas: selection.geo_areas ?? [],
    included: (selection.included_entities ?? []).length,
    excluded: (selection.excluded_entities ?? []).length,
  }
}
