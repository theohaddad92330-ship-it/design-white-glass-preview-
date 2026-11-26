import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  ANALYSIS_OPTIONAL_STEPS,
  ANALYSIS_STEPS,
  type AgentWarning,
  type AnalysisPartial,
  type AnalysisStep,
  type SourceHealth,
} from '@bellum/contracts'
import { i18n } from '@/i18n'
import { analysisRunSteps, analysisStepsBefore } from '@/lib/analysis-step-progress'

type AnalysisRunState = 'idle' | 'starting' | 'analyzing' | 'completed' | 'error'

/** Re-export the canonical 7-step list from ``@bellum/contracts`` under
 *  the names the rest of the web app already imports. The contract is
 *  the single source of truth — adding/removing a step is a deliberate
 *  contract change. */
export const STEP_KEYS = ANALYSIS_STEPS
export type StepKey = AnalysisStep

const STEP_KEY_SET: ReadonlySet<string> = new Set<string>(STEP_KEYS)
const OPTIONAL_STEP_KEYS: ReadonlySet<string> = new Set<string>(ANALYSIS_OPTIONAL_STEPS)

/** Le run a émis `step` : si elle est facultative, elle devient une étape de CE run. */
function withOptionalStep(emitted: StepKey[] | undefined, step: StepKey): StepKey[] {
  const list = emitted ?? []
  return OPTIONAL_STEP_KEYS.has(step) && !list.includes(step) ? [...list, step] : list
}

// The API worker only emits 4 phase markers (research/contacts/enrich/plan)
// — these tables anchor each phase's first/last bullet on the 7-step
// checklist. All in-between transitions come from the IA ``phase:progress``
// events, whose ``step`` is already a canonical ``StepKey``.
const PHASE_STARTED_STEP: Record<string, StepKey> = {
  // #2164.4 — le worker API annonce la réutilisation avant la 1re phase (émission réelle, `runViaGraph`).
  reuse_existing: 'reuse_existing',
  research: 'scope',
  contacts: 'decision_makers',
  classify: 'orga_chain',
  plan: 'messages',
  // #2164.10 / #2164.11 — le Judge (contrôle qualité) et la sauvegarde
  // finale émettent chacun leur PROPRE pulse `phase:started` (même
  // mécanisme que les 4 lignes ci-dessus), sur un `phase` qui porte déjà le
  // nom du `StepKey` — `analysis.worker.ts`, cases `'judge_completed'` et la
  // finalisation juste avant `runs.completeLatest`.
  quality_check: 'quality_check',
  save: 'save',
}

const PHASE_COMPLETED_STEP: Record<string, StepKey> = {
  research: 'account_sheet',
  research_complete: 'account_sheet',
  contacts: 'decision_makers',
  contacts_complete: 'decision_makers',
  classify: 'classification',
  classify_complete: 'classification',
  plan: 'messages',
  analysis_done: 'messages',
}

export function startedStepFor(phase: string): StepKey | null {
  return PHASE_STARTED_STEP[phase] ?? null
}
export function completedStepFor(phase: string): StepKey | null {
  return PHASE_COMPLETED_STEP[phase] ?? null
}
/** The IA service emits canonical ``StepKey`` values in the ``step`` field
 *  of every ``phase:progress`` event, so this is effectively an identity
 *  check — anything outside the known set is treated as a no-op so a
 *  rogue/legacy event can't move the checklist backwards. */
export function progressStepFor(step: string): StepKey | null {
  return STEP_KEY_SET.has(step) ? (step as StepKey) : null
}

/**
 * One line in the live log shown inside AnalysisProgressCard. Captures every
 * `phase:started` / `phase:progress` / `phase:complete` event so the user
 * sees the actual sub-steps (Brave hits, Firecrawl pages, Claude phases…)
 * instead of a single rotating message.
 */
type AnalysisEventEntry = {
  /** Wall-clock timestamp, used to render an elapsed-since-start chip. */
  at: number
  /** Short user-facing label (French). */
  label: string
  /** 0..100 — same axis as the progress bar. Null when the position is
   *  unknown (see {@link AnalysisRun.percent}). */
  percent: number | null
  /** Coarse status: drives the icon (running/done/failed). */
  status: 'running' | 'done' | 'failed'
  /** Stable key (e.g. `step:research:account_sheet`) used to dedupe
   *  successive heartbeat ticks whose label varies (`(5s)`, `(10s)`…)
   *  but semantically refer to the same step. */
  key: string
}

const MAX_EVENTS = 25

/**
 * Ceiling past which a run still flagged in-flight (`analyzing`/`starting`) is
 * treated as a dead orphan and evicted from the persisted map. A run only
 * leaves the in-flight state when a terminal Socket.IO event flips it
 * (`analysis:done` / `analysis:error`); if that event reaches nobody (the user
 * navigated away, closed the tab, or the worker was redeployed mid-run) the run
 * would otherwise stay `analyzing` in localStorage forever and keep lighting the
 * "analyse en cours" pill + routing to a stale account.
 *
 * Aligned to the worker's hard job ceiling (`JOB_TIMEOUT_MS = 1_200_000` ≈ 20 min
 * in ``apps/api/src/modules/analysis/analysis.constants.ts``) plus a margin, so a
 * genuinely long-but-live run — one still emitting phase/heartbeat events inside
 * the window — is NEVER pruned. 30 min ≥ the worker ceiling: anything quieter
 * than this cannot still be running.
 */
export const STALE_RUN_MS = 30 * 60 * 1000

/**
 * Pure staleness predicate (no store access) so it's trivially unit-testable and
 * shared by both the `pruneStale` action and the derived-entries filter.
 *
 * A run is stale iff it is still in an in-flight state (`analyzing`/`starting`)
 * AND its most recent event is older than {@link STALE_RUN_MS}. Terminal runs
 * (`completed`/`error`/`idle`) are NEVER stale — they've already reached a
 * definitive state and are surfaced/dismissed on their own terms. A run with no
 * recorded events at all is treated as stale (there's no heartbeat proving it's
 * alive), which also covers a corrupt/partial persisted entry.
 */
export function isRunStale(
  run: { state: string; events: ReadonlyArray<{ at: number }>; syncedAt?: number },
  now: number = Date.now(),
): boolean {
  if (run.state !== 'analyzing' && run.state !== 'starting') return false
  const lastEventAt = run.events.length > 0 ? run.events[run.events.length - 1].at : 0
  // A server read confirming "still active" is proof of life just as much as a
  // streamed event — more so, since it comes from state. Without counting it,
  // the GC would evict a run we are successfully polling merely because its
  // current phase is a quiet one.
  const lastProofOfLife = Math.max(lastEventAt, run.syncedAt ?? 0)
  return now - lastProofOfLife > STALE_RUN_MS
}

type AnalysisRun = {
  jobId: string | null
  accountId: string | null
  companyName: string
  state: AnalysisRunState
  phase: string
  /**
   * 0..100, or **null when we do not know where the run is**.
   *
   * Null is a real state, not a missing value. A run we did not launch ourselves
   * — rejoined after a reload, or adopted from the server because it was already
   * in flight — has no position until the server tells us one. Rendering that as
   * `0%` claimed the analysis had not started, on runs that were nearly done, and
   * sent users to the dashboard-manager to find out what was actually happening.
   * The UI renders null as "en cours" with no figure.
   */
  percent: number | null
  error: string | null
  /** Steps marked done by a backend ``phase:complete`` event. */
  completedSteps: StepKey[]
  /** Step currently in-flight per the latest backend event. */
  currentStep: StepKey | null
  /**
   * #2164.4/.5/.6 — les étapes FACULTATIVES que CE run a réellement émises
   * (`ANALYSIS_OPTIONAL_STEPS`). Absente d'ici ⇒ ni cochée ni comptée. Absent
   * d'un run persisté avant ce lot ⇒ lu comme « aucune ».
   */
  optionalSteps?: StepKey[]
  /** Append-only log of sub-step events for the live timeline. Newest last,
   *  capped at MAX_EVENTS so the array never grows unbounded. */
  events: AnalysisEventEntry[]
  /**
   * #2630.2 — CE QUI EST DÉJÀ TROUVÉ, pendant que la course tourne.
   *
   * Un par phase, dans l'ordre d'arrivée. Jamais un partiel vide : le contrat
   * (`analysisPartialFrom`) n'en produit aucun quand une phase n'a rien ramené,
   * donc l'écran n'a aucun moyen d'afficher « 0 contact trouvé ».
   *
   * Vidé à la fin de la course ({@link AnalysisStore.setComplete}) : le dossier
   * remplace l'aperçu, il ne s'y ajoute pas — deux listes de contacts côte à
   * côte, l'une partielle et l'autre complète, se liraient comme un désaccord.
   */
  partials: AnalysisPartial[]
  warnings: AgentWarning[]
  sourceHealth: Record<string, SourceHealth>
  /** Wall-clock of the last server state read that confirmed this run is still
   *  in flight. See {@link isRunStale}. */
  syncedAt?: number
}

/**
 * Merge an incoming percent into the one we already hold.
 *
 * Rules, in order:
 *  - `undefined` patch → the caller said nothing about percent; keep ours.
 *  - `null` patch → the caller explicitly does not know. Keep a known value if
 *    we have one; otherwise stay unknown. Never coerce unknown to 0 — that is
 *    the exact substitution this whole change exists to remove.
 *  - a number → monotonic max against a known value, or adopt it outright when
 *    we were unknown.
 */
export function resolvePercent(current: number | null, patch: number | null | undefined): number | null {
  if (patch === undefined) return current
  if (patch === null) return current
  if (current === null) return patch
  return Math.max(patch, current)
}

type AnalysisStore = {
  /** Active runs keyed by accountId. The same account can only have one run at a time. */
  runs: Record<string, AnalysisRun>
  start: (accountId: string, jobId: string, companyName: string) => void
  /**
   * Track a run that is ALREADY in flight server-side — rejoined after a
   * reload, opened from another tab, or a `start()` the API answered with
   * `in_flight`. Unlike {@link start} it does not claim a position: percent is
   * `null` (unknown) until a state read or a stream event supplies one.
   *
   * No-op when the account already has a run, so adopting can never rewind a
   * run we are already following. That is the bug this replaced: re-entering
   * `/search` for an in-flight analysis called `start()`, which reset a
   * three-phases-deep run to "Lancement de l'analyse — 0%".
   */
  adopt: (accountId: string, jobId: string, companyName: string) => void
  /** Record that the server confirmed this run is still in flight (proof of
   *  life for the staleness GC, independent of the event stream). */
  markSynced: (accountId: string, at?: number) => void
  setProgress: (accountId: string, patch: Partial<Pick<AnalysisRun, 'phase' | 'percent'>>) => void
  /** Mark ``step`` as the currently-running step (called on phase:started). */
  setCurrentStep: (accountId: string, step: StepKey | null) => void
  /** Mark ``step`` as completed (called on phase:complete). */
  markStepCompleted: (accountId: string, step: StepKey) => void
  /** Append one entry to the run's event log (capped at MAX_EVENTS). */
  addEvent: (accountId: string, event: AnalysisEventEntry) => void
  /**
   * #2630.2 — enregistrer ce qu'une phase vient de trouver. UN partiel par
   * phase : à la reprise, le worker rejoue la complétion des phases déjà
   * faites, et empiler les doublons afficherait deux fois la même trouvaille.
   */
  addPartial: (accountId: string, partial: AnalysisPartial) => void
  setDegraded: (
    accountId: string,
    patch: { warnings: AgentWarning[]; sourceHealth?: Record<string, SourceHealth> },
  ) => void
  setComplete: (accountId: string) => void
  setError: (accountId: string, error: string) => void
  clear: (accountId: string) => void
  /** Evict every stale orphan run (see {@link isRunStale}) from the persisted
   *  map. No-op when nothing is stale — returns the SAME `runs` reference so
   *  subscribers don't re-render on an idle prune. */
  pruneStale: (now?: number) => void
}

const NEW_RUN = (companyName: string, accountId: string, jobId: string): AnalysisRun => ({
  jobId,
  accountId,
  companyName,
  state: 'analyzing',
  phase: i18n.t('analysis:run.startingPhase'),
  percent: 0,
  error: null,
  completedSteps: [],
  currentStep: 'scope',
  events: [
    { at: Date.now(), label: i18n.t('analysis:run.startEvent'), percent: 0, status: 'running', key: 'analysis_start' },
  ],
  // #2630.2 — rien de trouvé encore : on n’affiche pas ce qu’on n’a pas.
  partials: [],
  warnings: [],
  sourceHealth: {},
})

/**
 * A run we did not launch: everything the local client can honestly assert is
 * that it exists and is in flight. No percent, no current step, and a neutral
 * label — the reconciler fills these in from the server's state read, usually
 * within a tick.
 */
const ADOPTED_RUN = (companyName: string, accountId: string, jobId: string): AnalysisRun => ({
  jobId,
  accountId,
  companyName,
  state: 'analyzing',
  phase: i18n.t('analysis:run.rejoinedPhase'),
  percent: null,
  error: null,
  completedSteps: [],
  currentStep: null,
  events: [
    {
      at: Date.now(),
      label: i18n.t('analysis:run.rejoinedPhase'),
      percent: null,
      status: 'running',
      key: 'analysis_rejoined',
    },
  ],
  // #2630.2 — rien de trouvé encore : on n’affiche pas ce qu’on n’a pas.
  partials: [],
  warnings: [],
  sourceHealth: {},
  syncedAt: Date.now(),
})

/**
 * Single source of truth for the live state of every in-progress analysis.
 * Both `useAnalysis` (started from the search bar) and `useAnalysisProgress`
 * (rejoined from AccountDetail) read+write the same entries, so the progress
 * card in either view shows the same data without re-fetching.
 */
export const useAnalysisStore = create<AnalysisStore>()(
  persist(
    set => ({
      runs: {},
      start: (accountId, jobId, companyName) =>
        set(s => ({ runs: { ...s.runs, [accountId]: NEW_RUN(companyName, accountId, jobId) } })),
      adopt: (accountId, jobId, companyName) =>
        set(s => {
          if (s.runs[accountId]) return s
          return { runs: { ...s.runs, [accountId]: ADOPTED_RUN(companyName, accountId, jobId) } }
        }),
      markSynced: (accountId, at = Date.now()) =>
        set(s => {
          const current = s.runs[accountId]
          if (!current) return s
          return { runs: { ...s.runs, [accountId]: { ...current, syncedAt: at } } }
        }),
      setProgress: (accountId, patch) =>
        set(s => {
          const current = s.runs[accountId]
          if (!current) return s
          // Percent is monotonic: a heartbeat that reports the phase-start
          // percent (15, 45, 72, 87) MUST NOT rewind a higher value already
          // pushed by the IA service. Same guard protects against out-of-order
          // events from Socket.IO reconnects.
          //
          // `null` on either side means "unknown", and unknown never overwrites
          // a known position — nor does it count as 0 in the comparison, which
          // would let an un-answerable server read erase real progress.
          const nextPercent = resolvePercent(current.percent, patch.percent)
          return { runs: { ...s.runs, [accountId]: { ...current, ...patch, percent: nextPercent } } }
        }),
      setCurrentStep: (accountId, step) =>
        set(s => {
          const current = s.runs[accountId]
          if (!current) return s
          if (!step) return { runs: { ...s.runs, [accountId]: { ...current, currentStep: null } } }
          if (!STEP_KEY_SET.has(step)) return s
          // #2164.4/.5/.6 — l'avancement se lit dans l'ORDRE D'AFFICHAGE
          // (`ANALYSIS_STEP_ORDER`), jamais dans l'index d'enum : une étape de
          // fin d'enum émise en 2e position ne coche pas ce qui la suit en enum.
          const optionalSteps = withOptionalStep(current.optionalSteps, step)
          // As soon as the backend reports the next in-flight sub-step,
          // every previous row should immediately show as completed in the UI
          // (e.g. reaching `account_sheet` means `scope` + `crosscheck` are done).
          const autoCompleted = analysisStepsBefore(step, optionalSteps)
          const completedSteps =
            autoCompleted.length > current.completedSteps.length ? autoCompleted : current.completedSteps
          return { runs: { ...s.runs, [accountId]: { ...current, completedSteps, currentStep: step, optionalSteps } } }
        }),
      markStepCompleted: (accountId, step) =>
        set(s => {
          const current = s.runs[accountId]
          if (!current) return s
          if (!STEP_KEY_SET.has(step)) return s
          const optionalSteps = current.optionalSteps ?? []
          const runSteps = analysisRunSteps(optionalSteps)
          const targetIdx = runSteps.indexOf(step)
          if (targetIdx < 0) return s
          // The backend only emits a `phase:complete` for the four major
          // pipeline phases (research / contacts / enrich / plan), so the
          // intermediate UI rows (`scope`, `crosscheck`…) never get an
          // explicit completion event. Auto-mark every preceding step as
          // done so the checklist progresses in order from the user's
          // point of view.
          const completedSteps = runSteps.slice(0, targetIdx + 1)
          if (
            completedSteps.length === current.completedSteps.length &&
            completedSteps.every((k, i) => current.completedSteps[i] === k)
          ) {
            return s
          }
          const nextStep = runSteps.find(k => !completedSteps.includes(k)) ?? null
          return {
            runs: {
              ...s.runs,
              [accountId]: { ...current, completedSteps, currentStep: nextStep },
            },
          }
        }),
      addEvent: (accountId, event) =>
        set(s => {
          const current = s.runs[accountId]
          if (!current) return s
          // Collapse heartbeat spam (`account_sheet (5s)`, `(10s)`, `(15s)`…)
          // into a single row that updates in place. We dedupe on the stable
          // `key` rather than the label because the label carries the elapsed
          // counter and changes every tick.
          const last = current.events[current.events.length - 1]
          if (last && last.key === event.key && last.status === 'running' && event.status === 'running') {
            const events = [
              ...current.events.slice(0, -1),
              { ...last, label: event.label, percent: event.percent, at: event.at },
            ]
            return { runs: { ...s.runs, [accountId]: { ...current, events } } }
          }
          const events = [...current.events, event].slice(-MAX_EVENTS)
          return { runs: { ...s.runs, [accountId]: { ...current, events } } }
        }),
      // #2630.2 — un partiel par phase, dans l'ordre d'arrivée.
      addPartial: (accountId, partial) =>
        set(s => {
          const current = s.runs[accountId]
          if (!current) return s
          const partials = [...current.partials.filter(kept => kept.phase !== partial.phase), partial]
          return { runs: { ...s.runs, [accountId]: { ...current, partials } } }
        }),
      setDegraded: (accountId, patch) =>
        set(s => {
          const current = s.runs[accountId]
          if (!current) return s
          // Dedupe warnings by code; merge source_health (latest per source wins).
          const seen = new Set(current.warnings.map(w => w.code))
          const warnings = [...current.warnings, ...patch.warnings.filter(w => !seen.has(w.code))]
          const sourceHealth = { ...current.sourceHealth, ...(patch.sourceHealth ?? {}) }
          return { runs: { ...s.runs, [accountId]: { ...current, warnings, sourceHealth } } }
        }),
      setComplete: accountId =>
        set(s => {
          const current = s.runs[accountId]
          if (!current) return s
          const events = [
            ...current.events,
            {
              at: Date.now(),
              label: i18n.t('analysis:run.doneEvent'),
              percent: 100,
              status: 'done' as const,
              key: 'analysis_done',
            },
          ].slice(-MAX_EVENTS)
          return {
            runs: {
              ...s.runs,
              [accountId]: {
                ...current,
                state: 'completed',
                phase: i18n.t('analysis:phases.analysis_done'),
                percent: 100,
                completedSteps: analysisRunSteps(current.optionalSteps ?? []),
                currentStep: null,
                events,
                // #2630.2 — le dossier remplace l'aperçu, il ne s'y ajoute pas :
                // deux listes de contacts côte à côte, l'une partielle et
                // l'autre complète, se liraient comme un désaccord.
                partials: [],
              },
            },
          }
        }),
      setError: (accountId, error) =>
        set(s => {
          const current = s.runs[accountId]
          if (!current) return s
          const events = [
            ...current.events,
            {
              at: Date.now(),
              label: error,
              percent: current.percent,
              status: 'failed' as const,
              key: 'analysis_error',
            },
          ].slice(-MAX_EVENTS)
          return { runs: { ...s.runs, [accountId]: { ...current, state: 'error', error, events } } }
        }),
      clear: accountId =>
        set(s => {
          if (!(accountId in s.runs)) return s
          const next = { ...s.runs }
          delete next[accountId]
          return { runs: next }
        }),
      pruneStale: (now = Date.now()) =>
        set(s => {
          let changed = false
          const next: Record<string, AnalysisRun> = {}
          for (const [accountId, run] of Object.entries(s.runs)) {
            if (isRunStale(run, now)) {
              changed = true
              continue
            }
            next[accountId] = run
          }
          // Return the untouched state when nothing was evicted so the `runs`
          // reference is preserved (Zustand skips the update / no re-render).
          return changed ? { runs: next } : s
        }),
    }),
    {
      name: 'bellum:analysis-runs',
      storage: createJSONStorage(() => localStorage),
      // Only persist the in-flight `runs` map — function refs would re-bind
      // on rehydrate anyway, and Zustand handles that automatically.
      partialize: state => ({ runs: state.runs }),
      version: 3,
    },
  ),
)

/** Selector hook for the run attached to a specific account. */
export function useAnalysisRun(accountId: string | null | undefined): AnalysisRun | null {
  return useAnalysisStore(s => (accountId ? (s.runs[accountId] ?? null) : null))
}
