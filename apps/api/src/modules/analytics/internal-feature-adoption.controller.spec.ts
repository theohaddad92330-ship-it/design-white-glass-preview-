import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { InternalFeatureAdoptionController } from './internal-feature-adoption.controller'
import type { FeatureAdoptionUsageService } from './feature-adoption-usage.service'

describe('InternalFeatureAdoptionController (#1685)', () => {
  it('is guarded by InternalSecretGuard at the class level', () => {
    // Cross-tenant : perdre la garde exposerait le compte de chaque palier de
    // tous les espaces à un appelant non authentifié.
    const guards = Reflect.getMetadata('__guards__', InternalFeatureAdoptionController) as unknown[]
    expect(guards).toContain(InternalSecretGuard)
  })

  it('délègue au service, en transmettant `days` en nombre', async () => {
    const usage = { report: jest.fn().mockResolvedValue({ windowDays: 90, measuredAt: 'x', signals: [] }) }
    const controller = new InternalFeatureAdoptionController(usage as unknown as FeatureAdoptionUsageService)

    await controller.getFeatureAdoption('45')

    expect(usage.report).toHaveBeenCalledWith(45)
  })

  it('sans `days`, transmet `undefined` — le service porte SON propre défaut', async () => {
    const usage = { report: jest.fn().mockResolvedValue({ windowDays: 90, measuredAt: 'x', signals: [] }) }
    const controller = new InternalFeatureAdoptionController(usage as unknown as FeatureAdoptionUsageService)

    await controller.getFeatureAdoption(undefined)

    expect(usage.report).toHaveBeenCalledWith(undefined)
  })
})
