/**
 * #1943.5 — le SUIVI d'une analyse lancée depuis la conversation (arbitrage de
 * Louis du 12/09 : suivi seul dans Action OS, facturation inchangée).
 *
 * Le lancement reste celui d'`AnalysisService.start` — il débite, il met en
 * file, il rembourse sur échec terminal. Ce module n'y touche pas : il inscrit
 * le suivi APRÈS, avec le débit que le REGISTRE montre (I4), sans rien réserver
 * (I3). Structurel (aucun import de service) : la composition vit dans le
 * contrôleur du pont.
 */

type LedgerLine = { kind: string; account_id: string | null; delta: number; created_at: Date | string }

/**
 * Tolérance d'horloge entre l'API (qui date le lancement) et la base (qui date
 * la ligne du registre) : au-delà, un débit n'est pas attribué à CE lancement —
 * il reste non mesuré, jamais deviné.
 */
const LEDGER_CLOCK_TOLERANCE_MS = 5_000

export async function trackConversationAnalysisLaunch(
  deps: {
    cards?: {
      trackAnalysisLaunch(input: {
        principal: { userId: string; email: string }
        accountId: string
        jobId: string
        debitObserved: number | null
        launchKey: string
      }): Promise<unknown>
    }
    ledger: { getLedger(userId: string, limit?: number): Promise<{ entries: LedgerLine[] }> }
    isDemo(userId: string): Promise<boolean>
    onError?: (error: unknown) => void
  },
  launch: {
    userId: string
    accountId: string
    jobId: string
    launched: boolean
    reason: string | null
    startedAt: Date
  },
): Promise<void> {
  // Rien de NEUF n'a été débité : un run déjà en vol, ou un dossier réutilisé.
  if (!deps.cards || !launch.launched || launch.reason === 'in_flight') return
  try {
    // I6 — une salle de démonstration ne débite rien : rien à suivre.
    if (await deps.isDemo(launch.userId)) return
    const { entries } = await deps.ledger.getLedger(launch.userId, 20)
    const since = launch.startedAt.getTime() - LEDGER_CLOCK_TOLERANCE_MS
    // Le registre est rendu du plus récent au plus ancien : le premier débit
    // d'analyse de CE compte, postérieur au lancement, est le sien.
    const debit = entries.find(
      entry =>
        entry.kind === 'consume_analysis' &&
        entry.account_id === launch.accountId &&
        new Date(entry.created_at).getTime() >= since,
    )
    await deps.cards.trackAnalysisLaunch({
      principal: { userId: launch.userId, email: '' },
      accountId: launch.accountId,
      jobId: launch.jobId,
      debitObserved: debit ? Math.abs(Number(debit.delta) || 0) : null,
      launchKey: `analysis:${launch.jobId}:${launch.startedAt.getTime()}`,
    })
  } catch (error) {
    // Le suivi ne fait JAMAIS échouer un lancement déjà payé — mais ne se tait pas.
    deps.onError?.(error)
  }
}
