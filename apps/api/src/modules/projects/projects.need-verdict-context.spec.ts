import { ProjectsController } from './projects.controller'

/**
 * #3390.9 — les 5P du compte du besoin voyagent avec le verdict, composés par le contrôleur
 * (`AccountStrategy5PService` vit dans un autre module). Absents (pas de compte, pas de service) :
 * `fiveP` reste `null`, jamais « prêt » par défaut.
 */
describe('ProjectsController.needVerdictFor — contexte commercial (#3390.9)', () => {
  const verdict = {
    verdict: {},
    profiles: [],
    runAt: null,
    commercialContext: { weeklyAvailableHours: 12, fiveP: null },
  }

  function build(over: { strategy?: unknown; accountId?: string | null; withService?: boolean }) {
    const controller = Object.create(ProjectsController.prototype) as Record<string, unknown>
    controller.workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }) }
    controller.needVerdict = {
      forNeed: jest.fn().mockResolvedValue(verdict),
      accountIdOf: jest.fn().mockResolvedValue(over.accountId === undefined ? 'acc-1' : over.accountId),
    }
    if (over.withService !== false) {
      controller.accountStrategy5P = { strategyFor: jest.fn().mockResolvedValue(over.strategy ?? null) }
    }
    return controller as unknown as ProjectsController
  }
  const call = (c: ProjectsController) => c.needVerdictFor('need-1', { userId: 'u-1' } as never)

  it('porte la readiness et la prochaine dimension des 5P du compte', async () => {
    const result = await call(build({ strategy: { readiness: 'READY_TO_VERIFY', next_action_dimension: 'people' } }))
    expect(result.commercialContext).toEqual({
      weeklyAvailableHours: 12,
      fiveP: { readiness: 'READY_TO_VERIFY', nextDimension: 'people' },
    })
  })

  it('sans compte ou sans stratégie lisible : `fiveP: null`, rien d’inventé', async () => {
    expect((await call(build({ accountId: null }))).commercialContext?.fiveP).toBeNull()
    expect((await call(build({ strategy: null }))).commercialContext?.fiveP).toBeNull()
    expect((await call(build({ withService: false }))).commercialContext?.fiveP).toBeNull()
  })
})
