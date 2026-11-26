import { AdminProfileContextsController } from './admin-profile-contexts.controller'
import type {
  AdminProfileContextsService,
  ProbabilityAuditReport,
  RegenerateReport,
} from './admin-profile-contexts.service'
import type { RegenerateProfileContextsDto } from './dto/regenerate-profile-contexts.dto'

function monter(overrides: Partial<AdminProfileContextsService> = {}): {
  controller: AdminProfileContextsController
  service: AdminProfileContextsService
} {
  const service = {
    audit: jest.fn(),
    regenerate: jest.fn(),
    ...overrides,
  } as unknown as AdminProfileContextsService
  return { controller: new AdminProfileContextsController(service), service }
}

describe('internal/admin/profile-contexts — la porte compte avant d’écrire', () => {
  it('GET probability-audit rend ce que le service compte, sans le retoucher', async () => {
    const report: ProbabilityAuditReport = { totalCount: 10, flaggedCount: 3, samples: [] }
    const { controller, service } = monter({ audit: jest.fn().mockResolvedValue(report) })
    await expect(controller.probabilityAudit()).resolves.toEqual(report)
    expect(service.audit).toHaveBeenCalledTimes(1)
  })

  it('POST regenerate transmet `confirmCount` du corps, tel quel', async () => {
    const report: RegenerateReport = { confirmCount: 3, results: [] }
    const { controller, service } = monter({ regenerate: jest.fn().mockResolvedValue(report) })
    const dto: RegenerateProfileContextsDto = { confirmCount: 3 }
    await expect(controller.regenerate(dto)).resolves.toEqual(report)
    expect(service.regenerate).toHaveBeenCalledWith(3)
  })
})
