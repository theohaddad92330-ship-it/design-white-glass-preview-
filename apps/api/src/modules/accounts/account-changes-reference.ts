/**
 * #4180 R25 — LA DATE DE RÉFÉRENCE de « ce qui a changé depuis la dernière vérification ».
 *
 * `previous_analysis_at` n'est posée qu'à la ré-analyse : EDF, Decathlon et Servier, analysés UNE fois,
 * l'avaient à `null`, donc la carte se taisait (« aucune comparaison possible ») alors qu'un dossier
 * analysé EST une vérification datée. Repli : la fin de la dernière analyse terminée. Aucune des deux :
 * `null`, et la carte se tait — jamais une date devinée.
 */
export function changesReferenceDate(previousAnalysisAt: Date | null, lastAnalyzedAt: string | null): Date | null {
  if (previousAnalysisAt) return previousAnalysisAt
  if (!lastAnalyzedAt) return null
  const parsed = new Date(lastAnalyzedAt)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
