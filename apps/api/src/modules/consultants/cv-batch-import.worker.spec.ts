import type { Job } from 'bullmq'
import type { Repository } from 'typeorm'
import type { CvBatchFileOutcome } from '@bellum/contracts'
import { CvBatchImportWorker } from './cv-batch-import.worker'
import type { CvIntakeService } from './cv-intake.service'
import type { CvBatchImportJobEntity } from '../../database/entities/cv-batch-import-job.entity'
import type { CvBatchImportJobData } from './cv-batch-import.queue'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'

/**
 * #2326.12 (épopée #2794) — LE WORKER : chaque entrée traverse
 * `CvIntakeService.intakeAutomatic`, et la ligne persistée avance à CHAQUE
 * fichier — c'est ce qui permet une VRAIE reprise après un crash, jamais un
 * rejeu depuis la première entrée.
 */
function makeWorker(row: Partial<CvBatchImportJobEntity>, intakeImpl?: (filename: string) => CvBatchFileOutcome) {
  const state: CvBatchImportJobEntity = {
    id: 'job-1',
    workspace_id: WORKSPACE,
    user_id: USER,
    kind: 'zip',
    status: 'queued',
    total: 0,
    processed_count: 0,
    outcomes: [],
    error: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...row,
  }
  const updates: Partial<CvBatchImportJobEntity>[] = []
  const jobs = {
    findOne: jest.fn(async () => ({ ...state })),
    update: jest.fn(async (_criteria: unknown, patch: Partial<CvBatchImportJobEntity>) => {
      Object.assign(state, patch)
      updates.push({ ...patch })
    }),
  } as unknown as Repository<CvBatchImportJobEntity>
  const intakeAutomatic = jest.fn(async (_ws: string, _user: string, input: { filename: string }) =>
    intakeImpl
      ? intakeImpl(input.filename)
      : ({ status: 'created', file: input.filename, consultantId: `c-${input.filename}` } satisfies CvBatchFileOutcome),
  )
  const cvIntake = { intakeAutomatic } as unknown as CvIntakeService
  return { worker: new CvBatchImportWorker(cvIntake, jobs), state, updates, intakeAutomatic }
}

function jobOf(data: CvBatchImportJobData): Job<CvBatchImportJobData> {
  return { data, attemptsMade: 1, opts: { attempts: 3 } } as unknown as Job<CvBatchImportJobData>
}

describe('CvBatchImportWorker.process', () => {
  it('traite chaque entrée et persiste la progression APRÈS CHAQUE fichier, pas en un seul bloc final', async () => {
    const { worker, state, updates } = makeWorker({ total: 2 })
    const result = await worker.process(
      jobOf({
        jobId: 'job-1',
        workspaceId: WORKSPACE,
        userId: USER,
        kind: 'zip',
        entries: [
          { filename: 'jean.pdf', fileB64: 'YQ==', capturedAtMs: null },
          { filename: 'marie.pdf', fileB64: 'YQ==', capturedAtMs: null },
        ],
      }),
    )

    expect(result).toEqual({ ok: true, processed: 2 })
    expect(state.status).toBe('done')
    expect(state.processed_count).toBe(2)
    expect(state.outcomes.map(o => o.file)).toEqual(['jean.pdf', 'marie.pdf'])
    // Une mise à jour par fichier (+ le passage à `processing`, + le `done` final).
    expect(updates.length).toBeGreaterThanOrEqual(4)
  })

  it('#2326.27 — REPREND depuis `processed_count`, ne retraite jamais un fichier déjà fait', async () => {
    const { worker, state, intakeAutomatic } = makeWorker({
      total: 2,
      processed_count: 1,
      outcomes: [{ status: 'created', file: 'jean.pdf', consultantId: 'c-jean.pdf' }],
    })

    await worker.process(
      jobOf({
        jobId: 'job-1',
        workspaceId: WORKSPACE,
        userId: USER,
        kind: 'zip',
        entries: [
          { filename: 'jean.pdf', fileB64: 'YQ==', capturedAtMs: null },
          { filename: 'marie.pdf', fileB64: 'YQ==', capturedAtMs: null },
        ],
      }),
    )

    expect(intakeAutomatic).toHaveBeenCalledTimes(1)
    expect(intakeAutomatic).toHaveBeenCalledWith(WORKSPACE, USER, expect.objectContaining({ filename: 'marie.pdf' }))
    expect(state.outcomes.map(o => o.file)).toEqual(['jean.pdf', 'marie.pdf'])
  })

  it('transmet la date CAPTURÉE de l’entrée, jamais « maintenant »', async () => {
    const { worker, intakeAutomatic } = makeWorker({ total: 1 })
    const capturedAtMs = new Date('2023-05-01T00:00:00.000Z').getTime()

    await worker.process(
      jobOf({
        jobId: 'job-1',
        workspaceId: WORKSPACE,
        userId: USER,
        kind: 'zip',
        entries: [{ filename: 'jean.pdf', fileB64: 'YQ==', capturedAtMs }],
      }),
    )

    expect(intakeAutomatic).toHaveBeenCalledWith(
      WORKSPACE,
      USER,
      expect.objectContaining({ capturedAt: new Date(capturedAtMs) }),
    )
  })
})
