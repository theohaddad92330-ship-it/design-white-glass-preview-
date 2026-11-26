import { isFailure, type Result } from '@bellum/utils'

/**
 * #1943.5 — la SEULE forme sous laquelle Action OS lit l'issue d'une analyse
 * lancée depuis la conversation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN PORT
 * ─────────────────────────────────────────────────────────────────────────────
 * Arbitrage de Louis (12/09) : l'analyse depuis la conversation est SUIVIE dans
 * Action OS, sa facturation ne change pas — 8 crédits débités au lancement par
 * `AnalysisService.start`, remboursés par le worker sur échec terminal. La carte
 * de suivi doit donc lire deux faits qu'elle ne possède pas : le STATUT de
 * l'analyse, et le REMBOURSEMENT inscrit au registre (I4 : « dépensé » = débit
 * observé − remboursement observé).
 *
 * GA-07 : ce fichier n'importe AUCUN service (formes structurelles seulement) et
 * son nom ne contient pas « service ». Le câblage vers `AnalysisService` et
 * `CreditsService` vit dans `action-os.module.ts`, la composition.
 *
 * Rien ici n'écrit, ne réserve ni ne débite (I2, I3).
 */
export const ANALYSIS_LAUNCH_OBSERVER = Symbol('ANALYSIS_LAUNCH_OBSERVER')

export type AnalysisLaunchObserver = {
  observe(input: { userId: string; accountId: string; jobId: string; launchedAt: Date }): Promise<{
    /**
     * `running` = encore en vol ; `unknown` = statut illisible ou job introuvable
     * — jamais « terminée ».
     *
     * #1952.17 — une analyse ANNULÉE n'est pas une analyse échouée. Ce port n'en
     * connaissait que trois issues terminales et repliait donc `canceled` sur
     * `failed` : la carte annonçait « L'analyse a échoué » et invitait à RELANCER
     * — donc à REDÉBITER — un travail que quelqu'un avait volontairement arrêté.
     * Un état terminal qui n'existe pas se replie sur le plus proche, et le plus
     * proche ment.
     */
    state: 'running' | 'done' | 'failed' | 'cancelled' | 'unknown'
    /** Remboursement OBSERVÉ au registre depuis le lancement ; `null` = registre non lu. */
    refunded: number | null
    /**
     * #1952.1 — l'avancement d'une analyse EN VOL, en étapes réellement
     * franchies sur le total du pipeline. `null` = position non établie, ce qui
     * couvre aussi « aucune phase franchie » : voir la raison ci-dessous.
     */
    progress: { done: number; total: number } | null
  }>
}

type AnalysisStatusReader = {
  getStatus(
    accountId: string,
    userId: string,
  ): Promise<Result<{ state: string; completedPhases?: readonly string[] }, unknown>>
}

type LedgerReader = {
  getLedger(
    userId: string,
    limit?: number,
  ): Promise<{ entries: { kind: string; account_id: string | null; delta: number; created_at: Date | string }[] }>
}

/**
 * L'observateur, depuis les deux lectures qui savent déjà répondre. Un statut
 * illisible est `unknown` (la carte reste « en cours ») ; un registre illisible
 * laisse le remboursement non mesuré plutôt que de le compter 0.
 */
export function analysisLaunchObserverFrom(
  analysis: AnalysisStatusReader,
  ledger: LedgerReader,
  /**
   * #1952.1 — le nombre de phases du pipeline, injecté par la composition
   * (`action-os.module.ts` le lit sur le module d'analyse, qui le possède). Un
   * total recopié ici serait un second endroit où la grandeur vit.
   */
  totalPhases: number,
): AnalysisLaunchObserver {
  return {
    async observe({ userId, accountId, launchedAt }) {
      const status = await analysis.getStatus(accountId, userId)
      if (isFailure(status)) return { state: 'unknown', refunded: null, progress: null }
      const state = status.output.state
      if (state === 'active')
        return { state: 'running', refunded: null, progress: phasesOf(status.output.completedPhases, totalPhases) }
      if (state !== 'completed' && state !== 'failed' && state !== 'canceled')
        return { state: 'unknown', refunded: null, progress: null }
      let refunded: number | null = null
      try {
        const { entries } = await ledger.getLedger(userId, 100)
        refunded = entries
          .filter(
            entry =>
              entry.kind === 'refund_analysis' &&
              entry.account_id === accountId &&
              new Date(entry.created_at).getTime() >= launchedAt.getTime(),
          )
          .reduce((sum, entry) => sum + Math.abs(Number(entry.delta) || 0), 0)
      } catch {
        refunded = null
      }
      // Une analyse TERMINÉE ne publie pas d'avancement : elle publie son issue.
      // #1952.17 — une analyse annulée n'est pas une analyse échouée : trois
      // issues terminales, trois branches, aucun repli.
      const outcome = state === 'completed' ? 'done' : state === 'canceled' ? 'cancelled' : 'failed'
      return { state: outcome, refunded, progress: null }
    },
  }
}

/**
 * #1952.1 / #1952.35 — L'AVANCEMENT NE SE DEVINE PAS, ET « 0 » N'EST PAS UNE
 * MESURE.
 *
 * `completedPhases` est la liste des points de contrôle validés. Elle est vide
 * dans DEUX situations que la lecture ne distingue pas : aucune phase franchie,
 * et lecteur de points de contrôle absent ou en échec (il dégrade en liste vide
 * plutôt que de casser la lecture du statut). Publier « 0 sur 4 » affirmerait la
 * première ; « en cours », vrai dans les deux, est la seule réponse honnête.
 */
function phasesOf(
  completedPhases: readonly string[] | undefined,
  total: number,
): { done: number; total: number } | null {
  if (!completedPhases || completedPhases.length === 0) return null
  if (!Number.isFinite(total) || total <= 0) return null
  return { done: completedPhases.length, total }
}
