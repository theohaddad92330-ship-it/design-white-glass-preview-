/**
 * #3755 — L'ÉVALUATION DE LA GRILLE DE QUALIFICATION, VUE DU WORKER D'ANALYSE.
 *
 * Même idiome que `commercial-brief-context-source.ts` (GA-07, cliquet au
 * plafond) : le worker dépend d'un PORT qu'il possède ; c'est
 * `analysis.module.ts` qui le branche sur `QualificationGridService`. Le worker ne
 * connaît pas le nom du service. Le port ne jette jamais : sans grille active,
 * il n'écrit rien et le verdict reste celui d'avant.
 */
export const ANALYSIS_QUALIFICATION_STEP = Symbol('ANALYSIS_QUALIFICATION_STEP')

export interface AnalysisQualificationStep {
  evaluateFromAnalysis(accountId: string, workspaceId: string | null): Promise<unknown>
}
