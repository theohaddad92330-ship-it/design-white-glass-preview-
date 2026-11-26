import { HttpException, InternalServerErrorException } from '@nestjs/common'
import { AnalysisService } from './analysis.service'
import { InternalAnalyzeController } from './internal-analyze.controller'

const OPERATOR = 'ae60314b-7261-4f00-86d6-1369a4352e78'

describe('InternalAnalyzeController', () => {
  let analysis: { start: jest.Mock }
  let controller: InternalAnalyzeController
  const prevOperator = process.env.DASHBOARD_OPERATOR_USER_ID

  beforeEach(() => {
    process.env.DASHBOARD_OPERATOR_USER_ID = OPERATOR
    analysis = {
      start: jest.fn().mockResolvedValue({ type: 'success', output: { jobId: 'job-1', accountId: 'acc-1' } }),
    }
    controller = new InternalAnalyzeController(analysis as unknown as AnalysisService)
  })

  afterEach(() => {
    process.env.DASHBOARD_OPERATOR_USER_ID = prevOperator
  })

  it('enqueues a fresh launch attributed to the configured operator user, forcing past the cache', async () => {
    const res = await controller.launch({ company: 'Société Générale' })

    expect(res).toEqual({ jobId: 'job-1', accountId: 'acc-1', fresh: true })
    expect(analysis.start).toHaveBeenCalledWith({ company_name: 'Société Générale' }, OPERATOR, { force: true })
  })

  it('honours fresh=false (cache-friendly, no force)', async () => {
    await controller.launch({ company: 'OVHcloud', fresh: false })
    expect(analysis.start).toHaveBeenCalledWith({ company_name: 'OVHcloud' }, OPERATOR, { force: false })
  })

  it('forwards the optional user_context when provided', async () => {
    await controller.launch({ company: 'Doctolib', userContext: 'ESN cloud, cible DSI' })
    expect(analysis.start).toHaveBeenCalledWith(
      { company_name: 'Doctolib', user_context: 'ESN cloud, cible DSI' },
      OPERATOR,
      { force: true },
    )
  })

  it('forwards a structured AnalysisContext preset untouched', async () => {
    const ctx = {
      preset: 'known-account' as const,
      commercialStatus: 'active' as const,
      lastInteraction: 'RDV mars 2026',
      openOpportunity: 'POC data',
    }
    await controller.launch({ company: 'Doctolib', userContext: ctx })
    expect(analysis.start).toHaveBeenCalledWith({ company_name: 'Doctolib', user_context: ctx }, OPERATOR, {
      force: true,
    })
  })

  it('rejects a structured context with an unknown preset', async () => {
    await expect(controller.launch({ company: 'Doctolib', userContext: { preset: 'nope', foo: 1 } })).rejects.toThrow()
  })

  it('rejects an empty company name', async () => {
    await expect(controller.launch({ company: '' })).rejects.toThrow()
  })

  it('500s with a clear message when the operator user is not configured', async () => {
    delete process.env.DASHBOARD_OPERATOR_USER_ID
    await expect(controller.launch({ company: 'X' })).rejects.toThrow(InternalServerErrorException)
    expect(analysis.start).not.toHaveBeenCalled()
  })

  it('maps a quota failure to HTTP 429', async () => {
    analysis.start.mockResolvedValueOnce({ type: 'failure', problem: { code: 'quota_exceeded', message: 'Limite' } })
    await expect(controller.launch({ company: 'X', fresh: false })).rejects.toThrow(HttpException)
  })
})
