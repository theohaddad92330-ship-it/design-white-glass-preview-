import { analysisScopeModeSchema, type AnalysisHistoryRow } from '@bellum/contracts'

/**
 * Théo B r2-mes-analyses.R5 — « Reprendre » rouvre le cadrage de CETTE analyse : le compte (par son identifiant),
 * son nom en valeur initiale, et le périmètre qu'on avait choisi. Rien d'autre n'est deviné (la zone et le contexte
 * libre ne sont pas conservés par le run : ils se re-saisissent, ils ne se reconstituent pas).
 */
export function resumeSearchParams(row: Pick<AnalysisHistoryRow, 'accountId' | 'companyName' | 'scopeMode'>) {
  const scope = analysisScopeModeSchema.safeParse(row.scopeMode)
  return {
    accountId: row.accountId,
    ...(row.companyName ? { company: row.companyName } : {}),
    ...(scope.success ? { scope: scope.data } : {}),
  }
}

/**
 * Théo B r2-mes-analyses.A5 — les gestes d'une ligne. On ne touche pas au cadrage ni à l'historique d'un
 * collègue : « Reprendre », « Réessayer » et « Retirer » n'existent que sur MES lignes ; « Voir le dossier » est
 * ouvert à tous (le dossier est celui de l'espace), tant que l'analyse a produit un dossier.
 */
export function rowActions(row: Pick<AnalysisHistoryRow, 'status' | 'mine'>) {
  return {
    resume: row.mine && row.status === 'completed',
    retry: row.mine && (row.status === 'error' || row.status === 'canceled'),
    viewDossier: row.status === 'completed',
    remove: row.mine && row.status !== 'analyzing',
  }
}
