import type { Queue } from 'bullmq'
import type { Repository } from 'typeorm'
import { BulkExportService } from './bulk-export.service'
import type { BulkExportJobEntity } from '../../database/entities/bulk-export-job.entity'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { BulkExportJobData } from './bulk-export.queue'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'

function makeJobsRepo(initial?: Partial<BulkExportJobEntity>) {
  const row: BulkExportJobEntity = {
    id: 'job-1',
    workspace_id: WORKSPACE,
    user_id: USER,
    kind: 'consultants_csv',
    status: 'queued',
    total: null,
    processed_count: 0,
    row_count: null,
    result_csv: null,
    error: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...initial,
  }
  const repo = {
    create: jest.fn(input => ({ ...row, ...input })),
    save: jest.fn(async (input: BulkExportJobEntity) => Object.assign(row, input)),
    findOne: jest.fn(async () => row),
    update: jest.fn(async (_where: unknown, patch: Partial<BulkExportJobEntity>) => Object.assign(row, patch)),
  } as unknown as Repository<BulkExportJobEntity>
  return { repo, row }
}

function makeConsultantsRepo(all: Array<{ id: string; full_name: string }>) {
  const repo = {
    count: jest.fn(async () => all.length),
    find: jest.fn(async ({ skip, take }: { skip: number; take: number }) => all.slice(skip, skip + take)),
  } as unknown as Repository<ConsultantEntity>
  return repo
}

describe('BulkExportService.process', () => {
  it('pagine le vivier entier et construit un CSV avec une ligne par consultant', async () => {
    const { repo: jobs, row } = makeJobsRepo()
    const consultants = makeConsultantsRepo([
      { id: 'c-1', full_name: 'Jean Dupont' },
      { id: 'c-2', full_name: 'Marie Martin' },
    ])
    const queue = { add: jest.fn() } as unknown as Queue<BulkExportJobData>
    const service = new BulkExportService(jobs, consultants, queue)

    const progress: Array<{ processed: number; total: number | null; status: string }> = []
    await service.process('job-1', WORKSPACE, view => progress.push(view))

    expect(row.status).toBe('done')
    expect(row.row_count).toBe(2)
    expect(row.result_csv).toContain('Jean')
    expect(row.result_csv).toContain('Marie')
    expect(progress.at(-1)).toMatchObject({ status: 'done', processed: 2, total: 2 })
  })

  it('`download` refuse tant que le job n’est pas `done` — jamais un fichier vide', async () => {
    const { repo: jobs } = makeJobsRepo({ status: 'processing' })
    const consultants = makeConsultantsRepo([])
    const queue = { add: jest.fn() } as unknown as Queue<BulkExportJobData>
    const service = new BulkExportService(jobs, consultants, queue)

    await expect(service.download(WORKSPACE, 'job-1')).rejects.toThrow()
  })

  // #4532 — REFUS : un job d'export appartient à SON espace ; le lire depuis un autre espace est un « introuvable »,
  // jamais le fichier d'un autre (RGPD : l'export reste un geste sur SES données).
  it('REFUS — `state` et `download` d’un job d’un AUTRE espace : introuvable, aucun CSV rendu', async () => {
    const { repo: jobs, row } = makeJobsRepo({ status: 'done', result_csv: 'secret', row_count: 1 })
    ;(jobs.findOne as jest.Mock).mockImplementation(async ({ where }: { where: { workspace_id: string } }) =>
      where.workspace_id === row.workspace_id ? row : null,
    )
    const queue = { add: jest.fn() } as unknown as Queue<BulkExportJobData>
    const service = new BulkExportService(jobs, makeConsultantsRepo([]), queue)
    const OTHER = 'w0000000-0000-4000-8000-000000000002'

    await expect(service.state(OTHER, 'job-1')).rejects.toThrow()
    await expect(service.download(OTHER, 'job-1')).rejects.toThrow()
    await expect(service.download(WORKSPACE, 'job-1')).resolves.toMatchObject({ csv: 'secret' })
  })
})
