/**
 * #3883 — rattrapage du STOCK de CV jamais lus, TOUS espaces confondus (décision Louis
 * 10/10 : « rattraper l'existant de TOUS les utilisateurs »). Cœur testable de
 * `scripts/cv-stock-catch-up.ts`. Déclenché À LA MAIN, jamais au déploiement ; aucun
 * bandeau (#3947 tient).
 *
 * Quatre garanties, chacune portée par ce fichier ou par la file :
 *  - SEULEMENT les fiches dont le CV n'a JAMAIS été lu (`cv_auto_read_at` vide) : une fiche
 *    lue sort de la sélection, donc relancer ne relit rien deux fois (idempotent) ;
 *  - jamais une fiche qualifiée, archivée, ni portant UNE correction humaine (« une
 *    correction humaine gagne toujours ») — décidé ICI, en TypeScript, sur des drapeaux
 *    lus en base, pour que le test sache dire NON ;
 *  - débit BORNÉ : un `delay` croissant par fiche dans la file BullMQ (un import ZIP dans
 *    le process API a déjà ralenti la prod, 05/10), la file lit une fiche à la fois ;
 *  - AUCUN crédit débité : la lecture est incluse, le texte du CV est déjà en base.
 *
 * SIMULATION par défaut : compte, par espace, ce qui partirait, n'écrit RIEN.
 */
export type StockCandidateRow = {
  id: string
  workspace_id: string
  /** Le propriétaire de la fiche — celui au nom de qui la lecture s'exécute. */
  user_id: string
  cv_auto_read_at: Date | string | null
  review_status: string | null
  archived_at: Date | string | null
  /** Une provenance `human` existe sur n'importe quelle colonne de la fiche. */
  has_human: boolean
}

export type StockCatchUpPort = {
  neverReadStockCandidates(): Promise<StockCandidateRow[]>
  enqueue(workspaceId: string, userId: string, consultantId: string, options?: { delay?: number }): Promise<boolean>
}

/** Espacement par défaut entre deux lectures mises en file. #3935 (lot BATCH-CV, 12/10/2026) :
 *  20 s → 0 — le débit est borné par le LIMITEUR de la file (`CV_AUTO_PARSE_RATE_PER_MINUTE`,
 *  `cv-auto-parse.queue.ts`) et la saturation IA par le report `retry-after`, plus par un
 *  espacement fixe (180 CV/h). `--espacement` reste disponible pour ralentir à la main. */
export const STOCK_CATCH_UP_SPACING_MS = 0

export function isNeverReadStock(row: StockCandidateRow): boolean {
  return row.cv_auto_read_at == null && row.archived_at == null && row.review_status !== 'qualified' && !row.has_human
}

type StockCatchUpReport = {
  mode: 'simulation' | 'applique'
  targeted: number
  selected: number
  queued: number
  perWorkspace: Record<string, number>
  /** Crédits débités : toujours 0 — la lecture est incluse. */
  creditsEstimated: number
  spacingMs: number
}

export async function runStockCatchUp(args: {
  service: StockCatchUpPort
  apply: boolean
  limit?: number
  spacingMs?: number
}): Promise<StockCatchUpReport> {
  const spacingMs = args.spacingMs ?? STOCK_CATCH_UP_SPACING_MS
  const targetedRows = (await args.service.neverReadStockCandidates()).filter(isNeverReadStock)
  const selectedRows =
    args.limit === undefined ? targetedRows : targetedRows.slice(0, Math.max(0, Math.floor(args.limit)))
  const perWorkspace: Record<string, number> = {}
  for (const row of selectedRows) perWorkspace[row.workspace_id] = (perWorkspace[row.workspace_id] ?? 0) + 1
  let queued = 0
  if (args.apply) {
    for (const [index, row] of selectedRows.entries()) {
      // #3883 — rattrapage du stock : le délai croît avec le rang, la file ne reçoit jamais tout d'un coup.
      if (await args.service.enqueue(row.workspace_id, row.user_id, row.id, { delay: index * spacingMs })) queued += 1
    }
  }
  return {
    mode: args.apply ? 'applique' : 'simulation',
    targeted: targetedRows.length,
    selected: selectedRows.length,
    queued,
    perWorkspace,
    creditsEstimated: 0,
    spacingMs,
  }
}

export function formatStockCatchUpReport(report: StockCatchUpReport): string {
  const head =
    report.mode === 'simulation'
      ? 'SIMULATION — rien n’est écrit (relancer avec --appliquer pour mettre en file).'
      : `APPLIQUÉ — ${report.queued} fiche(s) mise(s) en file.`
  const spaces = Object.entries(report.perWorkspace).map(([workspace, count]) => `  ${workspace} : ${count}`)
  return [
    head,
    `CV jamais lus : ${report.targeted} (lot de ${report.selected}, ${Object.keys(report.perWorkspace).length} espace(s))`,
    ...spaces,
    `Débit : une lecture toutes les ${Math.round(report.spacingMs / 1000)} s`,
    `Crédits débités : ${report.creditsEstimated} (lecture incluse)`,
  ].join('\n')
}
