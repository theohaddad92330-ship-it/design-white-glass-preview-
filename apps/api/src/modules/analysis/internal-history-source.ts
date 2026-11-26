/**
 * Le port par lequel le rattrapage d'une recherche relit l'« historique interne » d'un compte (#4687, GA-07).
 *
 * `AnalysisOnDemandService` ne connaît pas le nom de `ZeroLayerService` : il possède cette interface, et
 * `analysis.module.ts` branche l'implémentation, avec le port en TYPE DE RETOUR du `useFactory` (jamais
 * `useExisting`). Même idiome que `market-path-axis-source.ts` — le cliquet des imports service → service ne monte pas.
 */
export const INTERNAL_HISTORY_SOURCE = Symbol('INTERNAL_HISTORY_SOURCE')

export interface InternalHistorySource {
  describeInternalHistory(
    userId: string,
    account: { companyName: string; domain?: string | null; accountId?: string | null; workspaceId?: string | null },
  ): Promise<string | undefined>
}
