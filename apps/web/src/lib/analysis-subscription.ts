import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { analysisPartialSchema } from '@bellum/contracts'
import type { AgentWarning, SourceHealth } from '@bellum/contracts'
import { accountKeys } from '@/features/accounts/api'
import { contactKeys } from '@/features/contacts/api'
import { i18n } from '@/i18n'
import { subscribeToAccount } from '@/lib/socket'
import { completedStepFor, progressStepFor, startedStepFor, useAnalysisStore } from '@/stores/analysisStore'

/**
 * Phase-name → i18n-key table. Lives here (not in each consumer) so
 * `useAnalysis` (Search) and `useAnalysisProgress` (AccountDetail) cannot
 * drift. The backend emits four canonical phases (research, contacts,
 * classify, plan) as `phase:started`, three `_complete` pulses, plus the
 * poll-path estimates (`collecting`, `analysis_done`) — sub-step progress
 * carries a free-form `message` that wins over this table. Labels are the six
 * business stage names (Théo p.9) resolved at event time via `i18n.t` so they
 * follow the active language. `quality_check` labels the always-on judge stage
 * (graph event `judge_completed`) and `save` labels the final persistence
 * (right before `runs.completeLatest`) — both fire their own
 * `phase:started` pulse (#2164.10 / #2164.11, `analysis.worker.ts`) between
 * `plan` @87 and `analysis:done`.
 */
const PHASE_LABEL_KEYS: Record<string, string> = {
  collecting: 'analysis:phases.collecting',
  research: 'analysis:phases.research',
  research_complete: 'analysis:phases.research_complete',
  contacts: 'analysis:phases.contacts',
  contacts_complete: 'analysis:phases.contacts_complete',
  classify: 'analysis:phases.classify',
  classify_complete: 'analysis:phases.classify_complete',
  plan: 'analysis:phases.plan',
  quality_check: 'analysis:phases.quality_check',
  // #2164.11 — même pulse `phase:started` que les autres, ajouté par
  // `analysis.worker.ts` juste avant `runs.completeLatest`.
  save: 'analysis:phases.save',
  analysis_done: 'analysis:phases.analysis_done',
}

export function phaseLabel(phase: string): string {
  const key = PHASE_LABEL_KEYS[phase]
  return key ? i18n.t(key) : phase
}

/**
 * #2478 — l'ordre canonique du pipeline, pour NOMMER ce qu'un run échoué n'a
 * PAS atteint (pas seulement ce qu'il a fini). Mirroir de `PROGRESS_PHASES`
 * dans `apps/api/src/modules/analysis/analysis.constants.ts:53` — les deux
 * langages ne s'important pas, donc la même règle qui protège
 * `PHASE_LABEL_KEYS` d'une divergence s'applique ici : une seule liste,
 * relue par les deux surfaces (Search, AccountDetail).
 */
export const ANALYSIS_PHASES = ['research', 'contacts', 'classify', 'plan'] as const

type PhaseStartedPayload = { accountId: string; jobId: string; phase: string; percent: number }
type PhaseProgressPayload = {
  accountId: string
  jobId: string
  phase: string
  step: string
  percent: number
  message?: string
}
type PhaseCompletePayload = {
  accountId: string
  jobId: string
  phase: string
  percent: number
  /**
   * #2630.2 — CE QUE LA PHASE VIENT DE TROUVER, sous la forme bornée que le
   * serveur a produite (`analysisPartialFrom`, `analysis.gateway.ts`).
   *
   * Optionnel de deux façons, et les deux comptent : un serveur d'avant ce
   * déploiement n'envoie rien, et une phase qui n'a RIEN ramené n'envoie rien
   * non plus — une absence ne fait aucune ligne.
   */
  partial?: unknown
}
type AnalysisRetryPayload = { accountId: string; jobId: string; attempt: number; maxAttempts: number }
type AnalysisErrorPayload = { accountId: string; jobId: string; error: string }
type AnalysisDegradedPayload = {
  accountId: string
  jobId: string
  phase: string
  warnings: AgentWarning[]
  sourceHealth?: Record<string, SourceHealth>
}

type SubscriptionHooks = {
  /** Fired after the store has been marked `completed` and queries invalidated. */
  onDone?: (accountId: string) => void
  /** Fired after the store has been marked `error` and queries invalidated. */
  onError?: (accountId: string, error: string) => void
}

/**
 * Wire the singleton Socket.IO connection to the shared analysis store for a
 * given accountId. Returns the unsubscribe handle.
 *
 * This is the single source of truth for the analysis WS → store mapping —
 * both `useAnalysis` (Search start) and `useAnalysisProgress`
 * (AccountDetail rejoin) call this so they cannot diverge.
 */
/**
 * #4411 — la fin d'un run relit TOUT ce que la fiche affiche de ce compte, qu'elle
 * ait été ouverte avant ou après le lancement : le détail, les contacts, les
 * signaux, le plan d'action et les faits. Partagée avec le rattrapage d'état
 * (`reconcileAnalysisStatus`) pour que les deux chemins de fin ne divergent pas.
 */
export function invalidateAccountAfterRun(qc: QueryClient, accountId: string): void {
  qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
  qc.invalidateQueries({ queryKey: contactKeys.byAccount(accountId) })
  qc.invalidateQueries({ queryKey: ['accounts', 'signals'] })
  qc.invalidateQueries({ queryKey: ['plan-items'] })
  qc.invalidateQueries({ queryKey: ['account-facts'] })
}

export function subscribeToAnalysisRun(accountId: string, qc: QueryClient, hooks: SubscriptionHooks = {}): () => void {
  // Actions are stable refs in Zustand — safe to grab once at subscribe time.
  const { setProgress, setCurrentStep, markStepCompleted, addEvent, addPartial, setComplete, setError, setDegraded } =
    useAnalysisStore.getState()

  return subscribeToAccount(accountId, {
    'phase:started': p => {
      const { phase, percent } = p as PhaseStartedPayload
      const label = phaseLabel(phase)
      setProgress(accountId, { phase: label, percent })
      const stepKey = startedStepFor(phase)
      if (stepKey) setCurrentStep(accountId, stepKey)
      addEvent(accountId, {
        at: Date.now(),
        label,
        percent,
        status: 'running',
        key: `phase:${phase}`,
      })
    },
    'phase:progress': p => {
      const { phase, step, percent, message } = p as PhaseProgressPayload
      const knownPhaseLabel = PHASE_LABEL_KEYS[phase] ? phaseLabel(phase) : undefined
      const label = message || knownPhaseLabel || step
      setProgress(accountId, { phase: label, percent })
      const stepKey = progressStepFor(step)
      if (stepKey) setCurrentStep(accountId, stepKey)
      addEvent(accountId, {
        at: Date.now(),
        label,
        percent,
        status: 'running',
        key: `step:${phase}:${step}`,
      })
    },
    'phase:complete': p => {
      const { phase, percent, partial } = p as PhaseCompletePayload
      const label = phaseLabel(phase)
      setProgress(accountId, { phase: label, percent })
      const stepKey = completedStepFor(phase)
      if (stepKey) markStepCompleted(accountId, stepKey)
      // #2630.2 — ce que la phase vient de trouver entre dans la course. Le
      // contrat garde la porte : une charge malformée — un décompte à zéro, par
      // exemple — est REJETÉE plutôt qu'affichée, et une phase sans trouvaille
      // n'envoie rien du tout.
      if (partial !== undefined) {
        const parsed = analysisPartialSchema.safeParse(partial)
        if (parsed.success) addPartial(accountId, parsed.data)
      }
      addEvent(accountId, {
        at: Date.now(),
        label,
        percent,
        status: 'done',
        key: `complete:${phase}`,
      })
    },
    // #3820.b — recette prod 08/10 : l'écran restait figé sur « Lancement de
    // l'analyse » pendant toute une reprise BullMQ, faute d'un auditeur pour
    // ce pulse (le backend l'émet depuis longtemps, voir `analysis.gateway.ts`
    // `emitAnalysisRetry`). Le pourcentage n'est volontairement PAS fourni —
    // `setProgress` garde celui déjà acquis (voir `resolvePercent`) : une
    // reprise n'efface pas une position réelle.
    'analysis:retry': p => {
      const { attempt, maxAttempts } = p as AnalysisRetryPayload
      const label = i18n.t('analysis:run.retryingPhase', { attempt, maxAttempts })
      setProgress(accountId, { phase: label })
      const percent = useAnalysisStore.getState().runs[accountId]?.percent ?? 0
      addEvent(accountId, {
        at: Date.now(),
        label,
        percent,
        status: 'running',
        key: `retry:${attempt}`,
      })
    },
    'analysis:degraded': p => {
      const { warnings, sourceHealth } = p as AnalysisDegradedPayload
      setDegraded(accountId, { warnings, sourceHealth })
    },
    'analysis:done': () => {
      setComplete(accountId)
      invalidateAccountAfterRun(qc, accountId)
      // #2915.3 — sans ça, « Historique des analyses » (AccountRunsContainer)
      // restait sur les lignes lues avant cette analyse/reprise : sa query
      // (staleTime 60 s) ne se rafraîchit jamais toute seule tant qu'elle
      // reste montée, elle a besoin d'une invalidation explicite comme les
      // deux ci-dessus.
      qc.invalidateQueries({ queryKey: accountKeys.runs(accountId) })
      // #3212.4/.6 — jumelle de `runs` juste au-dessus : un run qui vient de
      // finir peut avoir fait apparaître une révision de verdict.
      qc.invalidateQueries({ queryKey: accountKeys.verdictRevision(accountId) })
      qc.invalidateQueries({ queryKey: accountKeys.verdictUnchanged(accountId) }) // #4180
      // R5-FIX (recette prod 14/10) — « 75 » puis « 76 comptes analysés » dans
      // le sélecteur du chat : la LISTE des comptes (`useAccounts`, source du
      // total « N comptes analysés ») n'était jamais invalidée à la fin d'un
      // run, seulement sa fiche et ses contacts — le total restait sur sa
      // valeur d'avant jusqu'au prochain refetch naturel (`staleTime` écoulé,
      // ou un remontage). Préfixe seul (comme `useAccount.ts:58`) : toutes les
      // combinaisons de filtre de CET utilisateur, pas une seule.
      qc.invalidateQueries({ queryKey: ['accounts', 'list'] })
      toast.success(i18n.t('analysis:toast.done'))
      hooks.onDone?.(accountId)
    },
    'analysis:error': p => {
      const { error } = p as AnalysisErrorPayload
      setError(accountId, error)
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      qc.invalidateQueries({ queryKey: accountKeys.runs(accountId) })
      qc.invalidateQueries({ queryKey: accountKeys.verdictRevision(accountId) })
      qc.invalidateQueries({ queryKey: accountKeys.verdictUnchanged(accountId) }) // #4180
      hooks.onError?.(accountId, error)
    },
  })
}
