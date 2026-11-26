import { OnboardingService } from './onboarding.service'

/**
 * perf P3 (29/09/2026) — `GET /onboarding/state` (0,4-1,9 s, une quinzaine de
 * routes) enchaînait SIX lectures indépendantes en série : étapes, état,
 * réponses, import actif, espace rejoint, effectif. Elles partent maintenant
 * ensemble — la garde vérifie qu'elles sont TOUTES lancées avant que la
 * première ne rende.
 *
 * #2021 (08/10/2026) — une SEPTIÈME lecture indépendante a rejoint le même
 * `Promise.all` : `firstOnboardingCompletionAt` (`first_completed_at`, le
 * signal du bandeau de reprise). Même raison, même garde.
 *
 * #4158.12 — une HUITIÈME : le membre qui attend la description de l'ESN
 * (`awaiting_company_admin`). Même raison, même garde.
 */
type Gate = { started: string[]; release: () => void; wait: () => Promise<void> }

function gate(): Gate {
  let release: () => void = () => {}
  const opened = new Promise<void>(resolve => {
    release = resolve
  })
  return { started: [], release, wait: () => opened }
}

describe('OnboardingService.getState — lectures en parallèle', () => {
  it('lance les huit lectures avant qu’aucune ne se termine', async () => {
    const g = gate()
    const track =
      <T>(name: string, value: T) =>
      async (): Promise<T> => {
        g.started.push(name)
        await g.wait()
        return value
      }
    const service = Object.create(OnboardingService.prototype) as OnboardingService
    Object.assign(service, {
      stages: { find: track('stages', [{ id: 's1', code: 'a', title: 'A', stage_order: 1, is_required: true }]) },
      states: {
        findOne: track('state', { user_id: 'u1', status: 'in_progress', current_stage_id: 's1', skipped_at: null }),
      },
      esnProfile: {
        getAnswersWithOrigin: track('answers', { answers: {}, inherited: [] }),
        getEffectifObservedAt: track('effectif', null),
        getAwaitingCompanyAdmin: track('awaiting', null),
      },
      findActiveImportSessionId: track('import', null),
      findJoinedWorkspace: track('joined', null),
      transitions: { findOne: track('firstCompletedAt', null) },
    })

    const pending = service.getState('u1')
    // Laisse les micro-tâches partir : tout ce qui est indépendant doit être lancé.
    await new Promise(resolve => setImmediate(resolve))
    expect([...g.started].sort()).toEqual([
      'answers',
      'awaiting',
      'effectif',
      'firstCompletedAt',
      'import',
      'joined',
      'stages',
      'state',
    ])
    g.release()
    const result = await pending
    expect(result.type).toBe('success')
  })
})
