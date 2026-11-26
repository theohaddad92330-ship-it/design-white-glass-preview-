/**
 * Décision Louis 12/10 (`c97_cv_lu_fiche_qualifiee`) — rattrapage de l'EXISTANT :
 * les fiches dont le CV a déjà été lu par le modèle (`cv_auto_read_at` posé) mais
 * restées `needs_review` passent `qualified`, comme le fait désormais toute
 * lecture réussie. Aucune IA, aucun crédit : un simple changement de statut.
 *
 * Trois garanties, décidées ICI en TypeScript sur des drapeaux lus en base, pour
 * que le test sache dire NON :
 *  - SEULEMENT les fiches lues (`cv_auto_read_at` non vide) — une fiche non lue
 *    n'a pas été lue, elle reste `needs_review` ;
 *  - jamais une fiche archivée, ni déjà qualifiée ;
 *  - jamais l'espace de démonstration (la démo est semée qualifiée).
 *
 * Idempotent (une fiche qualifiée sort de la sélection). SIMULATION par défaut ;
 * le compte est journalisé par le script. Déclenché À LA MAIN, jamais au déploiement.
 */
export type ReadQualifyCandidateRow = {
  id: string
  workspace_id: string
  cv_auto_read_at: Date | string | null
  review_status: string | null
  archived_at: Date | string | null
  is_demo: boolean | null
}

export type ReadQualifyPort = {
  needsReviewCandidates(): Promise<ReadQualifyCandidateRow[]>
  qualify(consultantIds: string[]): Promise<number>
}

export function isReadAwaitingQualification(row: ReadQualifyCandidateRow): boolean {
  return (
    row.cv_auto_read_at != null &&
    row.archived_at == null &&
    row.review_status === 'needs_review' &&
    row.is_demo !== true
  )
}

type ReadQualifyReport = {
  mode: 'simulation' | 'applique'
  targeted: number
  qualified: number
  perWorkspace: Record<string, number>
}

export async function runReadQualifyCatchUp(args: {
  service: ReadQualifyPort
  apply: boolean
}): Promise<ReadQualifyReport> {
  const rows = (await args.service.needsReviewCandidates()).filter(isReadAwaitingQualification)
  const perWorkspace: Record<string, number> = {}
  for (const row of rows) perWorkspace[row.workspace_id] = (perWorkspace[row.workspace_id] ?? 0) + 1
  const qualified = args.apply && rows.length > 0 ? await args.service.qualify(rows.map(row => row.id)) : 0
  return { mode: args.apply ? 'applique' : 'simulation', targeted: rows.length, qualified, perWorkspace }
}

export function formatReadQualifyReport(report: ReadQualifyReport): string {
  const head =
    report.mode === 'simulation'
      ? 'SIMULATION — rien n’est écrit (relancer avec --appliquer).'
      : `APPLIQUÉ — ${report.qualified} fiche(s) qualifiée(s).`
  const spaces = Object.entries(report.perWorkspace).map(([workspace, count]) => `  ${workspace} : ${count}`)
  return [
    head,
    `Fiches lues restées à revoir : ${report.targeted} (${Object.keys(report.perWorkspace).length} espace(s))`,
    ...spaces,
    'Crédits débités : 0 (aucune IA)',
  ].join('\n')
}
