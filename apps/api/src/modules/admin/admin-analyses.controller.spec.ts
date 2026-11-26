import { NotFoundException } from '@nestjs/common'
import { failure, success } from '@bellum/utils'
import type { AnalysisService } from '../analysis/analysis.service'
import { AdminAnalysesController } from './admin-analyses.controller'
import type { AdminAnalysesService } from './admin-analyses.service'
import { ListAnalysesQueryDto } from './dto/list-analyses-query.dto'

function makeController(analyses: Partial<AdminAnalysesService> = {}, analysisService: Partial<AnalysisService> = {}) {
  return new AdminAnalysesController(analyses as AdminAnalysesService, analysisService as AnalysisService)
}

describe('AdminAnalysesController', () => {
  it('forwards list filters to the read service', async () => {
    const listAnalyses = jest.fn().mockResolvedValue({ rows: [], total: 0, limit: 50, offset: 0 })
    const controller = makeController({ listAnalyses })
    const query = { search: 'acme', status: 'error', limit: 10 } as unknown as ListAnalysesQueryDto

    await controller.list(query)

    expect(listAnalyses).toHaveBeenCalledWith(expect.objectContaining({ search: 'acme', status: 'error', limit: 10 }))
  })

  it('404s when the audit is missing', async () => {
    const controller = makeController({ getAudit: jest.fn().mockResolvedValue(null) })
    await expect(controller.audit('missing')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('returns the audit when found', async () => {
    const audit = { accountId: 'acc-1', status: 'error' }
    const controller = makeController({ getAudit: jest.fn().mockResolvedValue(audit) })
    await expect(controller.audit('acc-1')).resolves.toBe(audit)
  })

  it('stops a run via cancelByAdmin, defaulting mode to "stop"', async () => {
    const cancelByAdmin = jest
      .fn()
      .mockResolvedValue(success({ accountId: 'acc-1', status: 'canceled', ownerUserId: 'u1' }))
    const controller = makeController({}, { cancelByAdmin })

    const res = await controller.stop('acc-1', {} as never)

    expect(cancelByAdmin).toHaveBeenCalledWith('acc-1', 'stop', 'backoffice')
    expect(res).toEqual({ accountId: 'acc-1', status: 'canceled', ownerUserId: 'u1' })
  })

  it('passes through mode + actor and force-errors when asked', async () => {
    const cancelByAdmin = jest
      .fn()
      .mockResolvedValue(success({ accountId: 'acc-1', status: 'error', ownerUserId: 'u1' }))
    const controller = makeController({}, { cancelByAdmin })

    await controller.stop('acc-1', { mode: 'force_error', actor: 'louis@bellum' } as never)

    expect(cancelByAdmin).toHaveBeenCalledWith('acc-1', 'force_error', 'louis@bellum')
  })

  it('404s when cancelByAdmin reports the account is not found', async () => {
    const cancelByAdmin = jest.fn().mockResolvedValue(failure({ code: 'not_found', message: 'nope' }))
    const controller = makeController({}, { cancelByAdmin })

    await expect(controller.stop('missing', {} as never)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('serves the launch heatmap on its own literal route (#1650)', async () => {
    const payload = { timeZone: 'Europe/Paris', days: [], now: { day: '2026-09-07', hour: 14 }, buckets: [], total: 0 }
    const getLaunchHeatmap = jest.fn().mockResolvedValue(payload)
    const controller = makeController({ getLaunchHeatmap })

    await expect(controller.heatmap()).resolves.toBe(payload)
    // The read instant is passed IN — the service never reaches for the clock.
    expect(getLaunchHeatmap).toHaveBeenCalledWith(expect.any(Date))
  })

  it('does not let the heatmap failure look like an empty week', async () => {
    const controller = makeController({ getLaunchHeatmap: jest.fn().mockRejectedValue(new Error('db down')) })

    await expect(controller.heatmap()).rejects.toThrow('db down')
  })
})
