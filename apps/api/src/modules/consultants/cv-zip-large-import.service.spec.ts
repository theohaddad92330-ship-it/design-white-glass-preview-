import { BadRequestException, PayloadTooLargeException } from '@nestjs/common'
import type { Queue } from 'bullmq'
import { CV_ZIP_LARGE_ARCHIVE_MAX_BYTES, CV_ZIP_MAX_ARCHIVE_BYTES } from '@bellum/contracts'
import { CvZipLargeImportService, cvZipImportJobId } from './cv-zip-large-import.service'
import type { CvZipImportJobData } from './cv-zip-import.queue'
import type { CvBatchImportReport } from '@bellum/contracts'

const WORKSPACE = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'

type FakeJob = {
  id: string
  data: CvZipImportJobData
  state: string
  progress?: unknown
  returnvalue?: CvBatchImportReport
  failedReason?: string
  updateData: jest.Mock
  remove: jest.Mock
}

function makeJob(data: CvZipImportJobData, over: Partial<FakeJob> = {}): FakeJob {
  return {
    id: 'cv-zip-abc',
    data,
    state: 'waiting',
    updateData: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined),
    ...over,
  }
}

function makeQueue(job: FakeJob | null = null) {
  const added: { name: string; data: unknown; opts: unknown }[] = []
  return {
    added,
    getJob: jest.fn(async () => (job ? { ...job, getState: async () => job.state } : null)),
    add: jest.fn(async (name: string, data: unknown, opts: unknown) => {
      added.push({ name, data, opts })
      return { id: (opts as { jobId?: string }).jobId }
    }),
  }
}

function makeStorageClient(over: { createSignedUploadUrl?: jest.Mock; remove?: jest.Mock } = {}) {
  return {
    createSignedUploadUrl:
      over.createSignedUploadUrl ??
      jest.fn(async (path: string) => ({ uploadUrl: `https://storage.example/${path}`, path, token: `tok-${path}` })),
    remove: over.remove ?? jest.fn(async () => true),
    bucket: jest.fn(() => 'bellum-files'),
    resumableUploadEndpoint: jest.fn(() => 'https://storage.example/storage/v1/upload/resumable'),
  }
}

function makeService(
  opts: { queue?: ReturnType<typeof makeQueue>; storage?: ReturnType<typeof makeStorageClient> } = {},
) {
  const queue = opts.queue ?? makeQueue()
  const storage = opts.storage ?? makeStorageClient()
  const service = new CvZipLargeImportService(queue as unknown as Queue<CvZipImportJobData>, storage as never)
  return { service, queue, storage }
}

describe('CvZipLargeImportService.createUploadTicket (#3065 lot 2b)', () => {
  it('signe une URL d’upload pour une archive dans la fenêtre de l’import volumineux', async () => {
    const { service, storage } = makeService()

    const ticket = await service.createUploadTicket(WORKSPACE, {
      filename: 'CV AAAAALL.zip',
      byteSize: CV_ZIP_MAX_ARCHIVE_BYTES + 1,
    })

    expect(ticket.uploadUrl).toContain('https://storage.example/')
    expect(ticket.path.startsWith(`${WORKSPACE}/cv-zip-import/`)).toBe(true)
    expect(ticket.path.endsWith('.zip')).toBe(true)
    expect(storage.createSignedUploadUrl).toHaveBeenCalledWith(ticket.path)
  })

  /**
   * #3303 — le dépôt REPRIS par morceaux (TUS) s'authentifie par un JETON
   * SIGNÉ limité à CE chemin (en-tête `x-signature`), jamais la clé service :
   * le ticket porte donc de quoi le navigateur configure `tus-js-client`
   * SANS deviner le nom du seau ni la forme de l'endpoint de reprise.
   */
  it('porte le jeton signé et l’endpoint TUS — jamais la clé service côté client', async () => {
    const { service, storage } = makeService()
    const ticket = await service.createUploadTicket(WORKSPACE, {
      filename: 'CV AAAAALL.zip',
      byteSize: CV_ZIP_MAX_ARCHIVE_BYTES + 1,
    })
    expect(ticket.token).toBe(`tok-${ticket.path}`)
    expect(ticket.bucket).toBe('bellum-files')
    expect(ticket.resumableEndpoint).toBe('https://storage.example/storage/v1/upload/resumable')
    expect(storage.bucket).toHaveBeenCalled()
    expect(storage.resumableUploadEndpoint).toHaveBeenCalled()
  })

  it('refuse une archive qui tient dans le transport inline — pas besoin de cette route', async () => {
    const { service } = makeService()
    await expect(
      service.createUploadTicket(WORKSPACE, { filename: 'petit.zip', byteSize: CV_ZIP_MAX_ARCHIVE_BYTES }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('refuse au-delà du plafond de l’import volumineux — jamais une URL signée pour rien', async () => {
    const { service } = makeService()
    await expect(
      service.createUploadTicket(WORKSPACE, {
        filename: 'trop-grand.zip',
        byteSize: CV_ZIP_LARGE_ARCHIVE_MAX_BYTES + 1,
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException)
  })

  it('deux espaces différents ne partagent jamais un préfixe de chemin', async () => {
    const { service } = makeService()
    const other = '99999999-9999-4999-8999-999999999999'
    const a = await service.createUploadTicket(WORKSPACE, { filename: 'a.zip', byteSize: CV_ZIP_MAX_ARCHIVE_BYTES + 1 })
    const b = await service.createUploadTicket(other, { filename: 'a.zip', byteSize: CV_ZIP_MAX_ARCHIVE_BYTES + 1 })
    expect(a.path.startsWith(`${WORKSPACE}/`)).toBe(true)
    expect(b.path.startsWith(`${other}/`)).toBe(true)
    expect(a.path).not.toEqual(b.path)
  })
})

describe('CvZipLargeImportService.start (#3065 lot 2b)', () => {
  const START_INPUT = { path: `${WORKSPACE}/cv-zip-import/abc.zip`, filename: 'CV AAAAALL.zip' }

  it('met en file un job déterminé par le chemin déposé', async () => {
    const { service, queue } = makeService()

    const result = await service.start(WORKSPACE, USER, START_INPUT)

    expect(result.state).toBe('queued')
    expect(queue.added).toHaveLength(1)
    expect(queue.added[0]!.data).toEqual({ workspaceId: WORKSPACE, userId: USER, ...START_INPUT })
    expect(queue.added[0]!.opts).toMatchObject({ jobId: result.job_id })
  })

  it('un second démarrage sur le MÊME chemin renvoie le job déjà en file — jamais deux traitements du même dépôt', async () => {
    const existing = makeJob(
      { workspaceId: WORKSPACE, userId: USER, ...START_INPUT },
      {
        id: cvZipImportJobId(START_INPUT.path),
        state: 'waiting',
      },
    )
    const { service, queue } = makeService({ queue: makeQueue(existing) })

    const result = await service.start(WORKSPACE, USER, START_INPUT)

    expect(result.state).toBe('queued')
    expect(result.job_id).toBe(existing.id)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('un job déjà ACTIF sur ce chemin est rendu `running`, sans le relancer', async () => {
    const existing = makeJob({ workspaceId: WORKSPACE, userId: USER, ...START_INPUT }, { state: 'active' })
    const { service, queue } = makeService({ queue: makeQueue(existing) })

    const result = await service.start(WORKSPACE, USER, START_INPUT)

    expect(result.state).toBe('running')
    expect(queue.add).not.toHaveBeenCalled()
  })
})

describe('CvZipLargeImportService.status (#3065 lot 2b)', () => {
  it('`unknown` quand aucun job ne porte cet identifiant', async () => {
    const { service } = makeService()
    expect(await service.status(WORKSPACE, 'cv-zip-inconnu')).toEqual({ state: 'unknown', jobId: 'cv-zip-inconnu' })
  })

  it('`unknown` quand le job existe mais appartient à un AUTRE espace — jamais une fuite d’état entre espaces', async () => {
    const OTHER = '99999999-9999-4999-8999-999999999999'
    const job = makeJob({ workspaceId: OTHER, userId: USER, path: 'x', filename: 'x.zip' }, { state: 'completed' })
    const { service } = makeService({ queue: makeQueue(job) })

    expect(await service.status(WORKSPACE, job.id)).toEqual({ state: 'unknown', jobId: job.id })
  })

  it('`queued` pendant que le job attend', async () => {
    const job = makeJob({ workspaceId: WORKSPACE, userId: USER, path: 'x', filename: 'x.zip' }, { state: 'waiting' })
    const { service } = makeService({ queue: makeQueue(job) })
    expect(await service.status(WORKSPACE, job.id)).toEqual({ state: 'queued', jobId: job.id })
  })

  it('`running` avec la progression déjà connue', async () => {
    const job = makeJob(
      { workspaceId: WORKSPACE, userId: USER, path: 'x', filename: 'x.zip' },
      { state: 'active', progress: { processed: 3, total: 10 } },
    )
    const { service } = makeService({ queue: makeQueue(job) })
    expect(await service.status(WORKSPACE, job.id)).toEqual({
      state: 'running',
      jobId: job.id,
      progress: { processed: 3, total: 10 },
    })
  })

  // Incident boucle API (05/10/2026) — un job ne reste plus à « 0 traité »
  // sans dire pourquoi : la PHASE et les octets reçus remontent jusqu'à l'écran.
  it('(f) `running` dit sa PHASE avant le premier fichier — téléchargement, octets reçus / total', async () => {
    const job = makeJob(
      { workspaceId: WORKSPACE, userId: USER, path: 'x', filename: 'x.zip' },
      {
        state: 'active',
        progress: { processed: 0, total: null, phase: 'download', bytesDownloaded: 1024, bytesTotal: 4096 },
      },
    )
    const { service } = makeService({ queue: makeQueue(job) })
    expect(await service.status(WORKSPACE, job.id)).toEqual({
      state: 'running',
      jobId: job.id,
      progress: { processed: 0, total: null, phase: 'download', bytesDownloaded: 1024, bytesTotal: 4096 },
    })
  })

  it('(f) une phase inconnue n’est jamais relayée telle quelle', async () => {
    const job = makeJob(
      { workspaceId: WORKSPACE, userId: USER, path: 'x', filename: 'x.zip' },
      { state: 'active', progress: { processed: 2, total: 5, phase: 'n’importe-quoi', bytesDownloaded: 'x' } },
    )
    const { service } = makeService({ queue: makeQueue(job) })
    expect(await service.status(WORKSPACE, job.id)).toEqual({
      state: 'running',
      jobId: job.id,
      progress: { processed: 2, total: 5 },
    })
  })

  it('`running` sans progression encore mesurée (le répertoire de l’archive n’est pas encore lu)', async () => {
    const job = makeJob(
      { workspaceId: WORKSPACE, userId: USER, path: 'x', filename: 'x.zip' },
      { state: 'active', progress: 0 },
    )
    const { service } = makeService({ queue: makeQueue(job) })
    expect(await service.status(WORKSPACE, job.id)).toEqual({ state: 'running', jobId: job.id, progress: null })
  })

  it('`done` avec le MÊME rapport que l’import en ligne', async () => {
    const report: CvBatchImportReport = {
      total: 2,
      summary: { created: 1, auto_updated: 0, exception: 0, too_big: 0, failed: 0, ignored: 1 },
      outcomes: [
        { status: 'created', file: 'a.pdf', consultantId: 'c1' },
        { status: 'ignored', file: 'notes.csv', reason: 'Ce n’est pas un CV' },
      ],
    }
    const job = makeJob(
      { workspaceId: WORKSPACE, userId: USER, path: 'x', filename: 'x.zip' },
      { state: 'completed', returnvalue: report },
    )
    const { service } = makeService({ queue: makeQueue(job) })
    expect(await service.status(WORKSPACE, job.id)).toEqual({ state: 'done', jobId: job.id, result: report })
  })

  it('`failed` avec la raison du worker', async () => {
    const job = makeJob(
      { workspaceId: WORKSPACE, userId: USER, path: 'x', filename: 'x.zip' },
      { state: 'failed', failedReason: 'Archive illisible ou corrompue.' },
    )
    const { service } = makeService({ queue: makeQueue(job) })
    expect(await service.status(WORKSPACE, job.id)).toEqual({
      state: 'failed',
      jobId: job.id,
      reason: 'Archive illisible ou corrompue.',
    })
  })
})
