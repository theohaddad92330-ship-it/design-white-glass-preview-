import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { InternalOnboardingFunnelController } from './internal-onboarding-funnel.controller'
import type { OnboardingFunnelService } from './onboarding-funnel.service'

describe('InternalOnboardingFunnelController (#1686)', () => {
  it('is guarded by InternalSecretGuard at the class level', () => {
    // Cross-tenant surface: losing the guard would expose every workspace's
    // onboarding funnel to an unauthenticated caller.
    const guards = Reflect.getMetadata('__guards__', InternalOnboardingFunnelController) as unknown[]
    expect(guards).toContain(InternalSecretGuard)
  })

  it('délègue au service avec l’horloge du contrôleur, pas celle du service', async () => {
    const funnel = { entonnoir: jest.fn().mockResolvedValue({ cohortes: [], etapes: [], espaces: 0, calculeA: 'x' }) }
    const controller = new InternalOnboardingFunnelController(funnel as unknown as OnboardingFunnelService)

    const before = Date.now()
    await controller.getOnboardingFunnel()
    const after = Date.now()

    expect(funnel.entonnoir).toHaveBeenCalledTimes(1)
    const passed = funnel.entonnoir.mock.calls[0]![0] as Date
    expect(passed.getTime()).toBeGreaterThanOrEqual(before)
    expect(passed.getTime()).toBeLessThanOrEqual(after)
  })
})
