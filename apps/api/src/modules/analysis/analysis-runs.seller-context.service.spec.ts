import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { AnalysisRunsService } from './analysis-runs.service'

/**
 * P0-08 reproducibility: a run pins the seller profile it was conditioned on, so
 * a resume replays the ORIGINAL inputs instead of re-deriving the current one.
 */
describe('AnalysisRunsService — seller-context snapshot (P0-08)', () => {
  const build = async (over: { query?: jest.Mock; findOne?: jest.Mock } = {}) => {
    const query = over.query ?? jest.fn().mockResolvedValue(undefined)
    const findOne = over.findOne ?? jest.fn()
    const repo = { manager: { query }, findOne }
    const moduleRef = await Test.createTestingModule({
      providers: [AnalysisRunsService, { provide: getRepositoryToken(AnalysisRunEntity), useValue: repo }],
    }).compile()
    return { service: moduleRef.get(AnalysisRunsService), query, findOne }
  }

  it('records the snapshot as jsonb on the run row', async () => {
    const { service, query } = await build()
    await service.recordSellerContext('run-1', { esn_name: 'Saturne', team_size: 60 })

    expect(query).toHaveBeenCalledTimes(1)
    const [sql, params] = query.mock.calls[0]
    expect(sql).toContain('UPDATE analysis_runs')
    expect(sql).toContain('seller_context')
    expect(params[0]).toBe('run-1')
    expect(JSON.parse(params[1])).toEqual({ esn_name: 'Saturne', team_size: 60 })
  })

  it('never throws when the snapshot write fails (best-effort)', async () => {
    const { service } = await build({ query: jest.fn().mockRejectedValue(new Error('db down')) })
    await expect(service.recordSellerContext('run-1', { a: 1 })).resolves.toBeUndefined()
  })

  it('reads back the latest run snapshot for an account', async () => {
    const seller = { esn_name: 'Saturne' }
    const { service, findOne } = await build({ findOne: jest.fn().mockResolvedValue({ seller_context: seller }) })

    await expect(service.getSellerContext('acc-1')).resolves.toEqual(seller)
    // newest-first — the resume must replay the MOST RECENT run's inputs.
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ order: { created_at: 'DESC' } }))
  })

  it('returns null when no run carries a snapshot (older run → caller falls back)', async () => {
    const { service } = await build({ findOne: jest.fn().mockResolvedValue({ seller_context: null }) })
    await expect(service.getSellerContext('acc-1')).resolves.toBeNull()
  })

  it('returns null (never throws) on a read error', async () => {
    const { service } = await build({ findOne: jest.fn().mockRejectedValue(new Error('boom')) })
    await expect(service.getSellerContext('acc-1')).resolves.toBeNull()
  })
})
