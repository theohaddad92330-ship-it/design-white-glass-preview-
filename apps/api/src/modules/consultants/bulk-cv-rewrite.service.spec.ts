import type { Queue } from 'bullmq'
import type { Repository } from 'typeorm'
import { BulkCvRewriteService } from './bulk-cv-rewrite.service'
import type { ConsultantsService } from './consultants.service'
import type { CreditsService } from '../credits/credits.service'
import type { BulkCvRewriteJobEntity } from '../../database/entities/bulk-cv-rewrite-job.entity'
import type { BulkCvRewriteJobData } from './bulk-cv-rewrite.queue'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const OPPORTUNITY = 'o0000000-0000-4000-8000-000000000001'

function makeRepo(initial?: Partial<BulkCvRewriteJobEntity>) {
  const row: BulkCvRewriteJobEntity = {
    id: 'job-1',
    workspace_id: WORKSPACE,
    user_id: USER,
    opportunity_id: OPPORTUNITY,
    consultant_ids: [],
    status: 'queued',
    total: 0,
    processed_count: 0,
    results: [],
    error: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...initial,
  }
  const repo = {
    create: jest.fn(input => ({ ...row, ...input })),
    save: jest.fn(async (input: BulkCvRewriteJobEntity) => Object.assign(row, input)),
    findOne: jest.fn(async () => row),
    update: jest.fn(async (_where: unknown, patch: Partial<BulkCvRewriteJobEntity>) => Object.assign(row, patch)),
  } as unknown as Repository<BulkCvRewriteJobEntity>
  return { repo, row }
}

function makeService(
  rewriteCv: jest.Mock,
  consumeEnrichmentCredit: jest.Mock,
  repoOverrides?: Partial<BulkCvRewriteJobEntity>,
) {
  const { repo, row } = makeRepo(repoOverrides)
  const queue = { add: jest.fn() } as unknown as Queue<BulkCvRewriteJobData>
  const consultants = { rewriteCv } as unknown as ConsultantsService
  const credits = {
    consumeEnrichmentCredit,
    hasEnrichmentCredit: jest.fn().mockResolvedValue(true),
  } as unknown as CreditsService
  return { service: new BulkCvRewriteService(repo, queue, consultants, credits), row }
}

describe('BulkCvRewriteService.process', () => {
  it('#2293.7 — un consultant en échec n’arrête pas les suivants, et débite EXACTEMENT 1 crédit par succès', async () => {
    const rewriteCv = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, rewrite: {} })
      .mockResolvedValueOnce({ ok: false, code: 'no_cv' })
      .mockResolvedValueOnce({ ok: true, rewrite: {} })
    const consumeEnrichmentCredit = jest.fn().mockResolvedValue({ ok: true, remaining: 9 })
    const { service, row } = makeService(rewriteCv, consumeEnrichmentCredit, {
      consultant_ids: ['c-1', 'c-2', 'c-3'],
      total: 3,
    })

    const progress: number[] = []
    await service.process('job-1', WORKSPACE, USER, view => progress.push(view.processed))

    expect(row.status).toBe('done')
    expect(row.results).toEqual([
      { consultantId: 'c-1', status: 'done', charged: true },
      { consultantId: 'c-2', status: 'failed', error: 'no_cv' },
      { consultantId: 'c-3', status: 'done', charged: true },
    ])
    expect(consumeEnrichmentCredit).toHaveBeenCalledTimes(2)
    expect(consumeEnrichmentCredit).toHaveBeenCalledWith(USER, { reason: 'cv_rewrite' })
  })

  it('un succès dont le débit échoue (crédits épuisés en cours de lot) se lit `failed`, jamais `done`', async () => {
    const rewriteCv = jest.fn().mockResolvedValue({ ok: true, rewrite: {} })
    const consumeEnrichmentCredit = jest.fn().mockResolvedValue({ ok: false, remaining: 0 })
    const { service, row } = makeService(rewriteCv, consumeEnrichmentCredit, {
      consultant_ids: ['c-1'],
      total: 1,
    })

    await service.process('job-1', WORKSPACE, USER, () => {})

    expect(row.results).toEqual([{ consultantId: 'c-1', status: 'failed', error: 'insufficient_credits' }])
  })

  it('une reprise (crash de worker) NE rejoue PAS les consultants déjà dans `results`', async () => {
    const rewriteCv = jest.fn().mockResolvedValue({ ok: true, rewrite: {} })
    const consumeEnrichmentCredit = jest.fn().mockResolvedValue({ ok: true, remaining: 5 })
    const { service, row } = makeService(rewriteCv, consumeEnrichmentCredit, {
      consultant_ids: ['c-1', 'c-2'],
      total: 2,
      results: [{ consultantId: 'c-1', status: 'done', charged: true }],
      processed_count: 1,
    })

    await service.process('job-1', WORKSPACE, USER, () => {})

    expect(rewriteCv).toHaveBeenCalledTimes(1)
    expect(rewriteCv).toHaveBeenCalledWith('c-2', OPPORTUNITY, WORKSPACE, USER)
    expect(row.results.map(r => r.consultantId)).toEqual(['c-1', 'c-2'])
  })

  it('un consultant dont la requête IA a expiré reste `unknown`, jamais `failed`', async () => {
    const rewriteCv = jest.fn().mockRejectedValue(new Error('Query timed out after 30000ms'))
    const consumeEnrichmentCredit = jest.fn()
    const { service, row } = makeService(rewriteCv, consumeEnrichmentCredit, { consultant_ids: ['c-1'], total: 1 })

    await service.process('job-1', WORKSPACE, USER, () => {})

    expect(row.results).toEqual([{ consultantId: 'c-1', status: 'unknown' }])
    expect(consumeEnrichmentCredit).not.toHaveBeenCalled()
  })
})

describe('BulkCvRewriteService.enqueue', () => {
  it('refuse dans l’espace de démonstration — même règle que le geste unitaire', async () => {
    const { service } = makeService(jest.fn(), jest.fn())
    await expect(service.enqueue(WORKSPACE, USER, OPPORTUNITY, ['c-1'], true)).rejects.toThrow()
  })
})
