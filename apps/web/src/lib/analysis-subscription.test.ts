import { QueryClient } from '@tanstack/react-query'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJSONStorage } from 'zustand/middleware'
import { accountKeys } from '@/features/accounts/api'
import { useAnalysisStore } from '@/stores/analysisStore'
import { phaseLabel, subscribeToAnalysisRun } from './analysis-subscription'

// Capture the handlers passed to subscribeToAccount so we can fire them
// synchronously from each test. Override the global mock from test/setup.ts
// (which only exposes the legacy connectToJob/disconnectSocket exports).
let captured: Record<string, (payload: unknown) => void> = {}
const unsubscribe = vi.fn()

vi.mock('@/lib/socket', () => ({
  subscribeToAccount: vi.fn((_accountId: string, handlers: Record<string, (p: unknown) => void>) => {
    captured = handlers
    return unsubscribe
  }),
}))

beforeAll(() => {
  // jsdom's localStorage occasionally breaks Zustand's persist middleware
  // (`storage.setItem is not a function`). Swap to a no-op storage for tests.
  useAnalysisStore.persist.setOptions({
    storage: createJSONStorage(() => ({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    })),
  })
})

const ACCOUNT_ID = 'acct-1'
const JOB_ID = 'job-1'

function freshStore(): void {
  // Wipe persisted runs so tests don't bleed.
  useAnalysisStore.setState({ runs: {} })
}

function newQc(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

describe('subscribeToAnalysisRun', () => {
  beforeEach(() => {
    freshStore()
    captured = {}
    unsubscribe.mockClear()
    useAnalysisStore.getState().start(ACCOUNT_ID, JOB_ID, 'Acme')
  })

  it('returns the unsubscribe handle from subscribeToAccount', () => {
    const handle = subscribeToAnalysisRun(ACCOUNT_ID, newQc())
    expect(handle).toBe(unsubscribe)
  })

  it('phase:started updates percent + currentStep + phase label', () => {
    subscribeToAnalysisRun(ACCOUNT_ID, newQc())
    captured['phase:started']({ accountId: ACCOUNT_ID, jobId: JOB_ID, phase: 'research', percent: 15 })

    const run = useAnalysisStore.getState().runs[ACCOUNT_ID]!
    expect(run.percent).toBe(15)
    expect(run.currentStep).toBe('scope')
    // Business stage label (Théo p.9) — started phases no longer leak the raw name.
    expect(run.phase).toBe('Recherche et sources')
  })

  it('phase:progress prefers `message` over PHASE_LABELS over `step`', () => {
    subscribeToAnalysisRun(ACCOUNT_ID, newQc())

    captured['phase:progress']({
      accountId: ACCOUNT_ID,
      jobId: JOB_ID,
      phase: 'research',
      step: 'crosscheck',
      percent: 22,
      message: 'Croisement des sources',
    })
    expect(useAnalysisStore.getState().runs[ACCOUNT_ID]!.phase).toBe('Croisement des sources')

    captured['phase:progress']({
      accountId: ACCOUNT_ID,
      jobId: JOB_ID,
      phase: 'collecting',
      step: 'crosscheck',
      percent: 25,
    })
    expect(useAnalysisStore.getState().runs[ACCOUNT_ID]!.phase).toBe('Recherche et sources…')

    captured['phase:progress']({
      accountId: ACCOUNT_ID,
      jobId: JOB_ID,
      phase: 'unknown',
      step: 'classification',
      percent: 80,
    })
    expect(useAnalysisStore.getState().runs[ACCOUNT_ID]!.phase).toBe('classification')
  })

  it('phase:progress advances currentStep when step is a canonical StepKey', () => {
    subscribeToAnalysisRun(ACCOUNT_ID, newQc())
    captured['phase:progress']({
      accountId: ACCOUNT_ID,
      jobId: JOB_ID,
      phase: 'research',
      step: 'crosscheck',
      percent: 22,
    })
    expect(useAnalysisStore.getState().runs[ACCOUNT_ID]!.currentStep).toBe('crosscheck')
  })

  it('phase:progress ignores unknown step values (defensive against rogue events)', () => {
    subscribeToAnalysisRun(ACCOUNT_ID, newQc())
    // The store starts a run with currentStep = 'scope' (see NEW_RUN).
    captured['phase:progress']({
      accountId: ACCOUNT_ID,
      jobId: JOB_ID,
      phase: 'research',
      step: 'not-a-real-step',
      percent: 22,
    })
    expect(useAnalysisStore.getState().runs[ACCOUNT_ID]!.currentStep).toBe('scope')
  })

  it('phase:complete marks the matching step + every preceding step as done', () => {
    subscribeToAnalysisRun(ACCOUNT_ID, newQc())
    captured['phase:complete']({
      accountId: ACCOUNT_ID,
      jobId: JOB_ID,
      phase: 'research_complete',
      percent: 40,
    })
    const run = useAnalysisStore.getState().runs[ACCOUNT_ID]!
    expect(run.completedSteps).toEqual(['scope', 'crosscheck', 'account_sheet'])
    expect(run.percent).toBe(40)
  })

  it('analysis:done invalidates account + contact + runs queries and calls onDone', () => {
    const qc = newQc()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const onDone = vi.fn()
    subscribeToAnalysisRun(ACCOUNT_ID, qc, { onDone })

    captured['analysis:done']({ accountId: ACCOUNT_ID, jobId: JOB_ID, percent: 100 })

    expect(useAnalysisStore.getState().runs[ACCOUNT_ID]!.state).toBe('completed')
    expect(useAnalysisStore.getState().runs[ACCOUNT_ID]!.percent).toBe(100)
    // #3212.6 — la révision de verdict se relit aussi après un run.
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(6)
    expect(spy).toHaveBeenCalledWith({ queryKey: accountKeys.verdictRevision(ACCOUNT_ID) })
    expect(spy).toHaveBeenCalledWith({ queryKey: accountKeys.verdictUnchanged(ACCOUNT_ID) }) // #4180
    // #2915.3 — sans cette clé, « Historique des analyses » restait sur les
    // lignes lues avant la reprise : la query ne se rafraîchit jamais tant
    // que rien ne l'invalide, même minutes après la fin réelle du run.
    expect(spy).toHaveBeenCalledWith({ queryKey: accountKeys.runs(ACCOUNT_ID) })
    // R5-FIX (recette prod 14/10) — « 75 » puis « 76 comptes analysés » dans le
    // sélecteur du chat : la LISTE des comptes (source de ce total) n'était
    // jamais invalidée à la fin d'un run, seulement sa fiche et ses contacts.
    expect(spy).toHaveBeenCalledWith({ queryKey: ['accounts', 'list'] })
    expect(onDone).toHaveBeenCalledWith(ACCOUNT_ID)
  })

  // #4411 — la fin d'un run relit TOUT ce que la fiche affiche de ce compte.
  it('analysis:done also invalidates signals, plan items and account facts (#4411)', () => {
    const qc = newQc()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    subscribeToAnalysisRun(ACCOUNT_ID, qc)

    captured['analysis:done']({ accountId: ACCOUNT_ID, jobId: JOB_ID, percent: 100 })

    expect(spy).toHaveBeenCalledWith({ queryKey: ['accounts', 'signals'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['plan-items'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['account-facts'] })
  })

  it('analysis:error sets the error + invalidates account + runs queries + calls onError', () => {
    const qc = newQc()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const onError = vi.fn()
    subscribeToAnalysisRun(ACCOUNT_ID, qc, { onError })

    captured['analysis:error']({ accountId: ACCOUNT_ID, jobId: JOB_ID, error: 'boom' })

    const run = useAnalysisStore.getState().runs[ACCOUNT_ID]!
    expect(run.state).toBe('error')
    expect(run.error).toBe('boom')
    expect(spy).toHaveBeenCalledTimes(4)
    expect(spy).toHaveBeenCalledWith({ queryKey: accountKeys.verdictRevision(ACCOUNT_ID) })
    expect(spy).toHaveBeenCalledWith({ queryKey: accountKeys.verdictUnchanged(ACCOUNT_ID) }) // #4180
    expect(spy).toHaveBeenCalledWith({ queryKey: accountKeys.runs(ACCOUNT_ID) })
    expect(onError).toHaveBeenCalledWith(ACCOUNT_ID, 'boom')
  })

  it('analysis:degraded accumulates warnings + merges source_health onto the run', () => {
    subscribeToAnalysisRun(ACCOUNT_ID, newQc())

    captured['analysis:degraded']({
      accountId: ACCOUNT_ID,
      jobId: JOB_ID,
      phase: 'research',
      warnings: [{ code: 'BRAVE_DOWN_FALLBACK_USED', message: 'Recherche web indisponible.' }],
      sourceHealth: { brave: 'down', firecrawl: 'ok', pappers: 'ok' },
    })

    let run = useAnalysisStore.getState().runs[ACCOUNT_ID]!
    expect(run.warnings.map(w => w.code)).toEqual(['BRAVE_DOWN_FALLBACK_USED'])
    expect(run.sourceHealth).toEqual({ brave: 'down', firecrawl: 'ok', pappers: 'ok' })

    // A second phase merges health and dedupes warnings by code.
    captured['analysis:degraded']({
      accountId: ACCOUNT_ID,
      jobId: JOB_ID,
      phase: 'contacts',
      warnings: [
        { code: 'BRAVE_DOWN_FALLBACK_USED', message: 'dup' },
        { code: 'APOLLO_EMPTY', message: 'Aucun contact Apollo.' },
      ],
      sourceHealth: { apollo: 'degraded' },
    })

    run = useAnalysisStore.getState().runs[ACCOUNT_ID]!
    expect(run.warnings.map(w => w.code)).toEqual(['BRAVE_DOWN_FALLBACK_USED', 'APOLLO_EMPTY'])
    expect(run.sourceHealth).toEqual({ brave: 'down', firecrawl: 'ok', pappers: 'ok', apollo: 'degraded' })
  })

  // #3820.b — la recette prod du 08/10 a trouvé un écran figé sur « Lancement
  // de l'analyse » pendant une reprise (BullMQ attempt 2/3) : le backend émet
  // bien `analysis:retry` (`analysis.gateway.ts`), mais rien ici ne l'écoutait
  // — exactement le motif « code posé, jamais appelé » que CLAUDE.md nomme.
  it('analysis:retry dit la tentative en cours au lieu de laisser le libellé figé', () => {
    subscribeToAnalysisRun(ACCOUNT_ID, newQc())
    // Un run déjà avancé (ex. recherche faite) avant la coupure qui a motivé
    // la reprise — le pourcentage connu ne doit pas être effacé.
    useAnalysisStore.getState().setProgress(ACCOUNT_ID, { percent: 40, phase: 'Recherche et sources' })

    captured['analysis:retry']({ accountId: ACCOUNT_ID, jobId: JOB_ID, attempt: 2, maxAttempts: 3 })

    const run = useAnalysisStore.getState().runs[ACCOUNT_ID]!
    expect(run.phase).toBe('Nouvelle tentative 2/3…')
    // Le pourcentage déjà acquis reste affiché — une reprise n'est pas un retour à 0.
    expect(run.percent).toBe(40)
    expect(run.events.at(-1)).toMatchObject({ label: 'Nouvelle tentative 2/3…', status: 'running' })
  })
})

describe('analysis store — monotonic percent guard', () => {
  beforeEach(() => {
    freshStore()
    useAnalysisStore.getState().start(ACCOUNT_ID, JOB_ID, 'Acme')
  })

  it('setProgress never lets percent rewind (heartbeat protection)', () => {
    const { setProgress } = useAnalysisStore.getState()

    setProgress(ACCOUNT_ID, { percent: 30, phase: 'Analyse en cours' })
    expect(useAnalysisStore.getState().runs[ACCOUNT_ID]!.percent).toBe(30)

    // Heartbeat with a lower floor must NOT rewind the bar.
    setProgress(ACCOUNT_ID, { percent: 15, phase: 'Analyse en cours… (30s)' })
    expect(useAnalysisStore.getState().runs[ACCOUNT_ID]!.percent).toBe(30)
    // Phase label still updates so the user sees activity.
    expect(useAnalysisStore.getState().runs[ACCOUNT_ID]!.phase).toBe('Analyse en cours… (30s)')

    // Higher percent still advances normally.
    setProgress(ACCOUNT_ID, { percent: 45 })
    expect(useAnalysisStore.getState().runs[ACCOUNT_ID]!.percent).toBe(45)
  })
})

describe('phaseLabel', () => {
  it('maps known phases to the French business stage labels (Théo p.9)', () => {
    expect(phaseLabel('analysis_done')).toBe('Analyse terminée !')
    expect(phaseLabel('research')).toBe('Recherche et sources')
    expect(phaseLabel('research_complete')).toBe('Cartographie du groupe')
    expect(phaseLabel('contacts')).toBe('Contacts et rôles')
    expect(phaseLabel('classify')).toBe('Stratégie et scoring')
    expect(phaseLabel('plan')).toBe("Plan d'action")
    expect(phaseLabel('quality_check')).toBe('Contrôle qualité')
  })

  it('returns the raw phase name for unknown values', () => {
    expect(phaseLabel('mystery-phase')).toBe('mystery-phase')
  })
})
