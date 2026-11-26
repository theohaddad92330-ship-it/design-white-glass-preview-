import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAnalysisStore } from '@/stores/analysisStore'
import { DEMO_RUN_DURATION_MS, playDemoAnalysis } from './demo-run'

const ACCOUNT = 'acc-demo-1'

function run() {
  return useAnalysisStore.getState().runs[ACCOUNT]
}

beforeEach(() => {
  vi.useFakeTimers()
  useAnalysisStore.setState({ runs: {} })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('playDemoAnalysis (scripted demo run)', () => {
  it('starts a run immediately so the progress card has something to show', () => {
    playDemoAnalysis(ACCOUNT, 'job-1', 'Une Vraie Entreprise')

    expect(run()).toBeDefined()
    expect(run()?.companyName).toBe('Une Vraie Entreprise')
    expect(run()?.state).not.toBe('completed')
  })

  it('advances through the checklist instead of jumping to the result', () => {
    playDemoAnalysis(ACCOUNT, 'job-1', 'Une Vraie Entreprise')

    vi.advanceTimersByTime(5_000)
    const early = run()?.percent ?? 0
    expect(early).toBeGreaterThan(0)
    expect(early).toBeLessThan(100)

    vi.advanceTimersByTime(15_000)
    expect(run()?.percent ?? 0).toBeGreaterThan(early)
    expect(run()?.state).not.toBe('completed')
  })

  it('completes only at the end of the script — the exit path a real run uses', () => {
    playDemoAnalysis(ACCOUNT, 'job-1', 'Une Vraie Entreprise')

    vi.advanceTimersByTime(DEMO_RUN_DURATION_MS - 1_000)
    expect(run()?.state).not.toBe('completed')

    vi.advanceTimersByTime(1_000)
    expect(run()?.state).toBe('completed')
    expect(run()?.percent).toBe(100)
  })

  it('walks every one of the seven steps, in order', () => {
    playDemoAnalysis(ACCOUNT, 'job-1', 'Une Vraie Entreprise')
    vi.advanceTimersByTime(DEMO_RUN_DURATION_MS)

    for (const step of [
      'scope',
      'crosscheck',
      'account_sheet',
      'decision_makers',
      'orga_chain',
      'classification',
      'messages',
    ]) {
      expect(run()?.completedSteps).toContain(step)
    }
  })

  it('cancelling stops the script dead — an abandoned run never reports completion', () => {
    const cancel = playDemoAnalysis(ACCOUNT, 'job-1', 'Une Vraie Entreprise')

    vi.advanceTimersByTime(5_000)
    cancel()
    vi.advanceTimersByTime(DEMO_RUN_DURATION_MS * 2)

    expect(run()?.state).not.toBe('completed')
  })

  it('logs readable events, not raw step keys', () => {
    playDemoAnalysis(ACCOUNT, 'job-1', 'Une Vraie Entreprise')
    vi.advanceTimersByTime(5_000)

    const events = run()?.events ?? []
    expect(events.length).toBeGreaterThan(0)
    expect(events.every(e => typeof e.label === 'string' && e.label.length > 0)).toBe(true)
  })

  /**
   * #2630.2 — LA PREUVE de la classification `DEMO_ANALYSIS_PARTIALS_COVERAGE`
   * (`apps/api/src/modules/demo/demo-coverage.ts`), qui dit « vide à dessein ».
   *
   * Une classification AFFIRME ; seule une garde qui fait tourner le code
   * prouve. Celle-ci joue le déroulé scripté EN ENTIER et vérifie qu'aucune
   * trouvaille n'apparaît : la démo simule le TEMPS, pas le CONTENU (docblock
   * de `playDemoAnalysis`), et annoncer « 4 contacts trouvés » pendant un
   * script inventerait du contenu sur un dossier que le visiteur va ouvrir
   * juste après — exactement ce que « JAMAIS de données fictives » interdit.
   *
   * Si quelqu'un scripte un jour de vraies trouvailles tirées du jeu de démo,
   * ce test tombera : il faudra alors déplacer la classification vers
   * « seedée », pas l'inverse.
   */
  it('#2630.2 — n’invente AUCUNE trouvaille : la démo simule le temps, pas le contenu', () => {
    playDemoAnalysis(ACCOUNT, 'job-1', 'Une Vraie Entreprise')

    for (let elapsed = 0; elapsed < DEMO_RUN_DURATION_MS; elapsed += 2_000) {
      vi.advanceTimersByTime(2_000)
      expect(run()?.partials ?? []).toEqual([])
    }
    // …et la carte n'a pas non plus d'état « rien trouvé » à afficher : le bloc
    // ne se rend qu'avec au moins une trouvaille (`AnalysisPartials`).
    expect(run()?.partials ?? []).toEqual([])
  })
})
