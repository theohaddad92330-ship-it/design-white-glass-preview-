import { AdminWeeklyDigestSweepController } from './admin-weekly-digest-sweep.controller'
import type {
  AdminWeeklyDigestSweepService,
  WeeklyDigestSweepAuditReport,
  WeeklyDigestSweepReport,
} from './admin-weekly-digest-sweep.service'
import type { SweepWeeklyDigestDto } from './dto/sweep-weekly-digest.dto'

function monter(overrides: Partial<AdminWeeklyDigestSweepService> = {}): {
  controller: AdminWeeklyDigestSweepController
  service: AdminWeeklyDigestSweepService
} {
  const service = {
    audit: jest.fn(),
    sweep: jest.fn(),
    ...overrides,
  } as unknown as AdminWeeklyDigestSweepService
  return { controller: new AdminWeeklyDigestSweepController(service), service }
}

describe('internal/admin/weekly-digest-sweep — la porte compte avant d’écrire', () => {
  it('GET sweep-audit rend ce que le service compte, sans le retoucher', async () => {
    const report: WeeklyDigestSweepAuditReport = {
      trueCount: 10,
      eligibleCount: 3,
      bySeedSignatureCount: 2,
      byPredatesColumnCount: 1,
      columnAddedAt: '2026-08-10T00:00:00.000Z',
    }
    const { controller, service } = monter({ audit: jest.fn().mockResolvedValue(report) })
    await expect(controller.auditReport()).resolves.toEqual(report)
    expect(service.audit).toHaveBeenCalledTimes(1)
  })

  it('POST sweep transmet `confirmCount` du corps, tel quel', async () => {
    const report: WeeklyDigestSweepReport = { confirmCount: 3, results: [] }
    const { controller, service } = monter({ sweep: jest.fn().mockResolvedValue(report) })
    const dto: SweepWeeklyDigestDto = { confirmCount: 3 }
    await expect(controller.sweep(dto)).resolves.toEqual(report)
    expect(service.sweep).toHaveBeenCalledWith(3)
  })
})
