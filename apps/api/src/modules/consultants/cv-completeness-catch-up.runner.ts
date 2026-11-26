/**
 * #3883 — rattrapage PONCTUEL du stock de CV lus avant le correctif de complétude
 * (décision Louis 10/10 : un script, pas un bouton ; le bandeau retiré par #3947
 * ne revient pas). Cœur testable de `scripts/cv-completeness-catch-up.ts`.
 *
 * SIMULATION par défaut : compte les fiches visées, n'écrit RIEN (aucune mise en
 * file). `apply: true` met en file, par la MÊME sélection que le vivier
 * (`CvAutoParseService`) : jamais une fiche qualifiée, archivée, ni portant une
 * correction humaine (« une correction humaine gagne toujours »). Idempotent et
 * reprenable : une fiche relue sort de la sélection (`cv_auto_read_at` avance),
 * une fiche déjà en file n'est pas doublée (job id par fiche) ; `limit` découpe
 * en lots.
 */
export type CompletenessCatchUpPort = {
  completenessCatchUpCount(workspaceId: string): Promise<number>
  enqueueCompletenessCatchUp(workspaceId: string, userId: string, limit?: number): Promise<{ queued: number }>
}

type CompletenessCatchUpReport = {
  mode: 'simulation' | 'applique'
  targeted: number
  selected: number
  queued: number
  /** Crédits débités : toujours 0 — la lecture est incluse, le texte du CV est déjà en base. */
  creditsEstimated: number
  /** Lectures modèle que l'écriture déclencherait (une par fiche sélectionnée). */
  modelReads: number
}

export async function runCompletenessCatchUp(args: {
  service: CompletenessCatchUpPort
  workspaceId: string
  userId: string
  apply: boolean
  limit?: number
}): Promise<CompletenessCatchUpReport> {
  const targeted = await args.service.completenessCatchUpCount(args.workspaceId)
  const selected = args.limit === undefined ? targeted : Math.min(targeted, Math.max(0, Math.floor(args.limit)))
  let queued = 0
  if (args.apply && selected > 0) {
    queued = (await args.service.enqueueCompletenessCatchUp(args.workspaceId, args.userId, args.limit)).queued
  }
  return {
    mode: args.apply ? 'applique' : 'simulation',
    targeted,
    selected,
    queued,
    creditsEstimated: 0,
    modelReads: selected,
  }
}

export function formatCompletenessCatchUpReport(report: CompletenessCatchUpReport): string {
  const head =
    report.mode === 'simulation'
      ? 'SIMULATION — rien n’est écrit (relancer avec --appliquer pour mettre en file).'
      : `APPLIQUÉ — ${report.queued} fiche(s) mise(s) en file.`
  return [
    head,
    `Fiches visées : ${report.targeted} (lot de ${report.selected})`,
    `Lectures modèle : ${report.modelReads}`,
    `Crédits débités : ${report.creditsEstimated} (lecture incluse)`,
  ].join('\n')
}
