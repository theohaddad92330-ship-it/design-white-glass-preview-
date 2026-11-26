import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { accountKeys } from '@/features/accounts/api'
import { i18n } from '@/i18n'
import { invalidateAccountAfterRun, phaseLabel } from '@/lib/analysis-subscription'
import { completedStepFor, useAnalysisStore } from '@/stores/analysisStore'

/**
 * Server-of-truth view of one analysis, from `GET /analysis/status/:accountId`.
 *
 * `percent` is nullable **on purpose**: the server answers "I cannot say" rather
 * than inventing a floor, and the client is required to render that as
 * "en cours" without a figure.
 */
export type AnalysisStatusPayload = {
  jobId: string | null
  state: 'active' | 'completed' | 'failed' | 'canceled' | 'not_found'
  percent: number | null
  phase: string | null
  /** Pipeline phases actually checkpointed, oldest-first. Absent on an API
   *  older than this field — treated as "no information", not "none done". */
  completedPhases?: string[]
}

/**
 * How often an in-flight run re-reads its position from the server.
 *
 * 15 s est la cadence d'un FILET : un flux temps réel livre déjà chaque phase,
 * et ce sondage ne rattrape que ce qui s'est perdu. Le payer plus cher serait
 * du gaspillage pour tout le monde.
 */
export const ANALYSIS_STATUS_POLL_MS = 15_000

/**
 * La cadence quand ce sondage est la SEULE source — 4 s.
 *
 * ⚠️ Ce n'est pas un réglage de confort, c'est un changement de RÔLE.
 *
 * Derrière une passerelle d'entreprise qui bloque le domaine de l'API, le repli
 * d'origine fait passer les appels par `/api` — mais les réécritures Vercel ne
 * proxifient pas les WebSockets. Socket.IO ne se connecte donc jamais, et ce
 * sondage cesse d'être un filet pour devenir le transport principal.
 *
 * À 15 s, l'utilisateur regarde une barre de progression qui bouge quatre fois
 * par minute sur un run de trois à six minutes : il conclut que le produit est
 * bloqué. À 4 s, la progression est perçue comme continue.
 *
 * Pourquoi 4 s et pas 1 s : sur un run de cinq minutes, cela fait 75 requêtes
 * au lieu de 20. `/analysis/status/:id` est une lecture indexée par compte, et
 * seuls les runs EN COURS sont sondés — la charge s'arrête d'elle-même à la fin
 * du run. Descendre à 1 s quadruplerait ce coût pour un gain que l'œil ne voit
 * pas : en dessous de ~3 s, une barre de progression est déjà lue comme fluide.
 */
export const ANALYSIS_STATUS_POLL_MS_NO_REALTIME = 4_000

/**
 * La cadence à retenir, selon que le temps réel est disponible ou non.
 *
 * `realtimeAvailable` est FAUX quand le repli d'origine est armé : c'est le
 * seul cas connu où Socket.IO ne peut pas se connecter alors que l'API répond.
 */
export function analysisPollMs(realtimeAvailable: boolean): number {
  return realtimeAvailable ? ANALYSIS_STATUS_POLL_MS : ANALYSIS_STATUS_POLL_MS_NO_REALTIME
}

type ReconcileHooks = {
  onDone?: (accountId: string) => void
  onError?: (accountId: string, error: string) => void
}

/**
 * Apply a server state read to the local run.
 *
 * This is the counterweight to `subscribeToAnalysisRun`, and the division of
 * labour is deliberate:
 *
 *  - The Socket.IO stream is an **accelerator**. It makes updates immediate.
 *  - This function is the **record**. It answers "where is this run, really?"
 *    from persisted state, so a client that joined late, reloaded, or missed
 *    the terminal event still converges on the truth.
 *
 * Treating the stream as the record is what produced the ALSEDIS report: a
 * dossier finished server-side (badge « Terminé », 5 contacts, a full action
 * plan) while the SPA sat on "Analyse en cours… 0%" forever, because the one
 * event that would have released it had already been emitted to nobody. An
 * absence of events was being rendered as a fact about the work.
 */
export function reconcileAnalysisStatus(
  accountId: string,
  status: AnalysisStatusPayload,
  qc: QueryClient,
  hooks: ReconcileHooks = {},
): void {
  const store = useAnalysisStore.getState()
  const run = store.runs[accountId]
  if (!run) return

  // ── Terminal states ──────────────────────────────────────────────────────
  // The run is over and we may never have been told. Resolve the screen.
  if (status.state === 'completed') {
    if (run.state !== 'completed') {
      store.setComplete(accountId)
      invalidateAccountAfterRun(qc, accountId) // #4411
      // R5-FIX (recette prod 14/10) — jumeau du même défaut dans
      // `analysis-subscription.ts` (`'analysis:done'`) : un run qui se termine
      // SEULEMENT via ce rattrapage (le socket a manqué l'événement terminal,
      // voir le docblock du fichier) laissait la LISTE des comptes — source du
      // total « N comptes analysés » — sur sa valeur d'avant cette fin.
      qc.invalidateQueries({ queryKey: ['accounts', 'list'] })
      toast.success(i18n.t('analysis:toast.done'))
      hooks.onDone?.(accountId)
    }
    return
  }
  if (status.state === 'failed' || status.state === 'canceled') {
    if (run.state !== 'error') {
      const message = i18n.t(
        status.state === 'canceled' ? 'analysis:run.canceledMessage' : 'analysis:run.interruptedMessage',
      )
      store.setError(accountId, message)
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      hooks.onError?.(accountId, message)
    }
    return
  }

  // #3666.8 — `not_found` : le serveur ne connaît AUCUNE tâche pour ce compte (et le
  // dossier n'est pas terminé). Ce n'est pas une preuve de vie : la confirmer à chaque
  // sondage empêchait le GC de péremption de libérer un bandeau figé « Lancement de
  // l'analyse ». On ne touche à rien — ni `syncedAt`, ni la position.
  if (status.state === 'not_found') return

  // ── Still in flight: seed the position from state ─────────────────────────
  // Proof of life for the staleness GC, independent of the (possibly dead)
  // stream.
  store.markSynced(accountId)

  // `setProgress` is monotonic and null-safe, so a state read can only ever
  // move the bar forward — live events already applied are never rewound.
  if (status.percent !== null || status.phase) {
    store.setProgress(accountId, {
      ...(status.phase ? { phase: phaseLabel(status.phase) } : {}),
      percent: status.percent,
    })
  }

  // Rebuild the step checklist from the phases that really completed. Showing
  // only "Lancement de l'analyse" while four phases are done is the same lie
  // as 0%, just in another form. `markStepCompleted` back-fills every earlier
  // step, so applying them in order converges on the furthest one reached.
  for (const phase of status.completedPhases ?? []) {
    const step = completedStepFor(phase)
    if (step) store.markStepCompleted(accountId, step)
  }
}
