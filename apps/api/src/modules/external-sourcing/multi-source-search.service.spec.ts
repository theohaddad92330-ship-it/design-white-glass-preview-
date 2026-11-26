import type { Queue } from 'bullmq'
import type { Repository } from 'typeorm'
import { MultiSourceSearchService } from './multi-source-search.service'
import type { ExternalSourcingService } from './external-sourcing.service'
import type { MultiSourceSearchJobEntity } from '../../database/entities/multi-source-search-job.entity'
import type { MultiSourceSearchJobData } from './multi-source-search.queue'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const NEED = 'n0000000-0000-4000-8000-000000000001'

function makeRepo(initial?: Partial<MultiSourceSearchJobEntity>) {
  const row: MultiSourceSearchJobEntity = {
    id: 'job-1',
    workspace_id: WORKSPACE,
    user_id: 'u0000000-0000-4000-8000-000000000001',
    need_id: NEED,
    status: 'queued',
    total: null,
    processed_count: 0,
    results: [],
    candidates: null,
    error: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...initial,
  }
  const repo = {
    create: jest.fn(input => ({ ...row, ...input })),
    save: jest.fn(async (input: MultiSourceSearchJobEntity) => Object.assign(row, input)),
    findOne: jest.fn(async () => row),
    update: jest.fn(async (_where: unknown, patch: Partial<MultiSourceSearchJobEntity>) => Object.assign(row, patch)),
  } as unknown as Repository<MultiSourceSearchJobEntity>
  return { repo, row }
}

function candidate(id: string, sourceKind: string) {
  return { id, fullName: `Profil ${id}`, title: null, sourceKind, sharedSkills: [], limits: [] } as never
}

describe('MultiSourceSearchService.process', () => {
  it('interroge chaque source configurée une par une, et classe les candidats réunis', async () => {
    const { repo: jobs, row } = makeRepo()
    const configuredProviderKeys = jest.fn(() => ['partner_bench', 'inbound_candidacy'])
    const searchOneSource = jest
      .fn()
      .mockResolvedValueOnce([candidate('a', 'partner_bench')])
      .mockResolvedValueOnce([candidate('b', 'inbound_candidacy')])
    const externalSourcing = { configuredProviderKeys, searchOneSource } as unknown as ExternalSourcingService
    const queue = { add: jest.fn() } as unknown as Queue<MultiSourceSearchJobData>
    const service = new MultiSourceSearchService(jobs, queue, externalSourcing)

    const progress: number[] = []
    await service.process('job-1', WORKSPACE, NEED, undefined, view => progress.push(view.processed))

    expect(row.status).toBe('done')
    expect(row.results).toEqual([
      { source: 'partner_bench', status: 'done', candidateCount: 1 },
      { source: 'inbound_candidacy', status: 'done', candidateCount: 1 },
    ])
    expect(row.candidates).toHaveLength(2)
    expect(progress).toEqual([0, 1, 2, 2])
  })

  it("l'échec d'UNE source n'arrête pas les suivantes — l'isolation par source", async () => {
    const { repo: jobs, row } = makeRepo()
    const configuredProviderKeys = jest.fn(() => ['partner_bench', 'inbound_candidacy'])
    const searchOneSource = jest
      .fn()
      .mockRejectedValueOnce(new Error('db_gone'))
      .mockResolvedValueOnce([candidate('b', 'inbound_candidacy')])
    const externalSourcing = { configuredProviderKeys, searchOneSource } as unknown as ExternalSourcingService
    const queue = { add: jest.fn() } as unknown as Queue<MultiSourceSearchJobData>
    const service = new MultiSourceSearchService(jobs, queue, externalSourcing)

    await service.process('job-1', WORKSPACE, NEED, undefined, () => {})

    expect(row.results).toEqual([
      { source: 'partner_bench', status: 'failed', error: 'db_gone' },
      { source: 'inbound_candidacy', status: 'done', candidateCount: 1 },
    ])
    expect(row.candidates).toHaveLength(1)
  })

  it('une reprise NE rejoue PAS les sources déjà dans `results`', async () => {
    const { repo: jobs, row } = makeRepo({
      results: [{ source: 'partner_bench', status: 'done', candidateCount: 0 }],
      processed_count: 1,
    })
    const configuredProviderKeys = jest.fn(() => ['partner_bench', 'inbound_candidacy'])
    const searchOneSource = jest.fn().mockResolvedValue([])
    const externalSourcing = { configuredProviderKeys, searchOneSource } as unknown as ExternalSourcingService
    const queue = { add: jest.fn() } as unknown as Queue<MultiSourceSearchJobData>
    const service = new MultiSourceSearchService(jobs, queue, externalSourcing)

    await service.process('job-1', WORKSPACE, NEED, undefined, () => {})

    expect(searchOneSource).toHaveBeenCalledTimes(1)
    expect(searchOneSource).toHaveBeenCalledWith(NEED, WORKSPACE, 'inbound_candidacy', undefined)
  })

  it('une source dont la requête a expiré reste `unknown`, jamais `failed`', async () => {
    const { repo: jobs, row } = makeRepo()
    const configuredProviderKeys = jest.fn(() => ['partner_bench'])
    const searchOneSource = jest.fn().mockRejectedValue(new Error('Query timed out after 30000ms'))
    const externalSourcing = { configuredProviderKeys, searchOneSource } as unknown as ExternalSourcingService
    const queue = { add: jest.fn() } as unknown as Queue<MultiSourceSearchJobData>
    const service = new MultiSourceSearchService(jobs, queue, externalSourcing)

    await service.process('job-1', WORKSPACE, NEED, undefined, () => {})

    expect(row.results).toEqual([{ source: 'partner_bench', status: 'unknown' }])
  })
})
