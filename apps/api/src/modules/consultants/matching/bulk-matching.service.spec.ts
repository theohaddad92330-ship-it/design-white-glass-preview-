import type { Queue } from 'bullmq'
import type { Repository } from 'typeorm'
import { BulkMatchingService } from './bulk-matching.service'
import type { MatchingService } from './matching.service'
import type { BulkMatchingJobEntity } from '../../../database/entities/bulk-matching-job.entity'
import type { BulkMatchingJobData } from './bulk-matching.queue'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'

/** Un dépôt EN MÉMOIRE minimal — ce test n'exerce pas TypeORM, seulement la
 *  reprise (`processed_count`) et l'isolation par besoin (#2293.7). */
function makeRepo(initial?: Partial<BulkMatchingJobEntity>) {
  const row: BulkMatchingJobEntity = {
    id: 'job-1',
    workspace_id: WORKSPACE,
    user_id: USER,
    need_ids: [],
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
    save: jest.fn(async (input: BulkMatchingJobEntity) => {
      Object.assign(row, input)
      return row
    }),
    findOne: jest.fn(async () => row),
    update: jest.fn(async (_where: unknown, patch: Partial<BulkMatchingJobEntity>) => Object.assign(row, patch)),
  } as unknown as Repository<BulkMatchingJobEntity>
  return { repo, row }
}

function makeService(matchNeed: jest.Mock, repoOverrides?: Partial<BulkMatchingJobEntity>) {
  const { repo, row } = makeRepo(repoOverrides)
  const queue = { add: jest.fn() } as unknown as Queue<BulkMatchingJobData>
  const matching = { matchNeed } as unknown as MatchingService
  return { service: new BulkMatchingService(repo, queue, matching), row, queue }
}

describe('BulkMatchingService.process', () => {
  it('#2293.7 — un besoin en échec n’arrête pas les suivants, et se lit dans `results`', async () => {
    const matchNeed = jest
      .fn()
      .mockResolvedValueOnce({ recommended: [{ id: 'a' }, { id: 'b' }] })
      .mockRejectedValueOnce(new Error('db_gone'))
      .mockResolvedValueOnce({ recommended: [] })
    const { service, row } = makeService(matchNeed, {
      need_ids: ['need-1', 'need-2', 'need-3'],
      total: 3,
      status: 'queued',
    })

    const progress: number[] = []
    await service.process('job-1', WORKSPACE, USER, false, view => progress.push(view.processed))

    expect(row.status).toBe('done')
    expect(row.processed_count).toBe(3)
    expect(row.results).toEqual([
      { needId: 'need-1', status: 'done', matchCount: 2 },
      { needId: 'need-2', status: 'failed', error: 'db_gone' },
      { needId: 'need-3', status: 'done', matchCount: 0 },
    ])
    // Un pulse à l'entrée en `processing`, un par besoin traité, un dernier à `done`.
    expect(progress).toEqual([0, 1, 2, 3, 3])
  })

  it('une reprise (crash de worker) NE rejoue PAS les besoins déjà dans `results`', async () => {
    const matchNeed = jest.fn().mockResolvedValue({ recommended: [] })
    const { service, row } = makeService(matchNeed, {
      need_ids: ['need-1', 'need-2'],
      total: 2,
      results: [{ needId: 'need-1', status: 'done', matchCount: 1 }],
      processed_count: 1,
    })

    await service.process('job-1', WORKSPACE, USER, false, () => {})

    expect(matchNeed).toHaveBeenCalledTimes(1)
    expect(matchNeed).toHaveBeenCalledWith('need-2', WORKSPACE, USER, { canReadFinance: false })
    expect(row.results.map(result => result.needId)).toEqual(['need-1', 'need-2'])
  })

  it('un besoin dont la requête a expiré reste `unknown`, jamais `failed` — un timeout n’est pas un échec', async () => {
    const matchNeed = jest.fn().mockRejectedValue(new Error('Query timed out after 30000ms'))
    const { service, row } = makeService(matchNeed, { need_ids: ['need-1'], total: 1 })

    await service.process('job-1', WORKSPACE, USER, false, () => {})

    expect(row.results).toEqual([{ needId: 'need-1', status: 'unknown' }])
  })
})
