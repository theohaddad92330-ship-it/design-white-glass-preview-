import { describe, expect, it, vi } from 'vitest'
import type { CvZipLargeUploadTicket } from '@bellum/contracts'

/**
 * #3303 — le TRANSPORT de l'archive volumineuse (dépôt REPRIS par morceaux,
 * protocole TUS), isolé de `tus-js-client` lui-même — une doublure qui capture
 * les options passées au constructeur `tus.Upload`, même discipline que le
 * reste du dépôt (`rangeSource` côté worker, `ZipStreamEntry` en test).
 *
 * `previousUploadsQueue` joue le rôle de ce que le VRAI `tus-js-client`
 * retrouverait dans son propre stockage (fingerprint déjà connu) — posé
 * AVANT la construction, comme le ferait une reprise réelle après rechargement.
 */
const { FakeUpload } = vi.hoisted(() => {
  class FakeUpload {
    static instances: FakeUpload[] = []
    static previousUploadsQueue: unknown[] = []
    file: File
    options: {
      endpoint: string
      chunkSize: number
      retryDelays: number[]
      headers: Record<string, string>
      metadata: Record<string, string>
      onShouldRetry?: (error: Error, attempt: number, options: { retryDelays?: number[] }) => boolean
      onError: (error: Error) => void
      onProgress: (bytesUploaded: number, bytesTotal: number) => void
      onSuccess: () => void
    }
    findPreviousUploads: () => Promise<unknown[]>
    resumeFromPreviousUpload = vi.fn()
    start = vi.fn()

    constructor(file: File, options: FakeUpload['options']) {
      this.file = file
      this.options = options
      const previous = FakeUpload.previousUploadsQueue
      FakeUpload.previousUploadsQueue = []
      this.findPreviousUploads = vi.fn(async () => previous)
      FakeUpload.instances.push(this)
    }
  }
  return { FakeUpload }
})

vi.mock('tus-js-client', () => ({ Upload: FakeUpload }))

const { uploadCvZipArchive, pollCvZipLargeImport, consultantsApi } = await import('./api')

function ticket(over: Partial<CvZipLargeUploadTicket> = {}): CvZipLargeUploadTicket {
  return {
    uploadUrl: 'https://storage.example/w1/cv-zip-import/abc.zip',
    path: 'w1/cv-zip-import/abc.zip',
    token: 'signed-token-abc',
    bucket: 'bellum-files',
    resumableEndpoint: 'https://api.example/storage/v1/upload/resumable/sign',
    ...over,
  }
}

function currentUpload(): InstanceType<typeof FakeUpload> {
  const instance = FakeUpload.instances.at(-1)
  if (!instance) throw new Error('tus.Upload was never constructed')
  return instance
}

describe('uploadCvZipArchive (#3303 — dépôt TUS repris par morceaux)', () => {
  it('configure le transport : endpoint du ticket, morceaux de 6 Mo, jeton signé en x-signature', async () => {
    FakeUpload.instances = []
    // Windows envoie parfois `application/x-zip-compressed` — jamais fait confiance.
    const file = new File(['PK'], 'CV AAAAALL.zip', { type: 'application/x-zip-compressed' })
    const promise = uploadCvZipArchive(ticket(), file)
    const upload = currentUpload()
    expect(upload.options.endpoint).toBe('https://api.example/storage/v1/upload/resumable/sign')
    expect(upload.options.chunkSize).toBe(6 * 1024 * 1024)
    expect(upload.options.headers).toEqual({ 'x-signature': 'signed-token-abc', 'x-upsert': 'true' })
    // #3303 (décision 2) — jamais `file.type`, toujours `application/zip`.
    expect(upload.options.metadata).toEqual({
      bucketName: 'bellum-files',
      objectName: 'w1/cv-zip-import/abc.zip',
      contentType: 'application/zip',
      cacheControl: '3600',
    })
    upload.options.onSuccess()
    await expect(promise).resolves.toBeUndefined()
  })

  it('sans reprise trouvée, démarre un envoi neuf', async () => {
    FakeUpload.instances = []
    FakeUpload.previousUploadsQueue = []
    const file = new File(['PK'], 'archive.zip', { type: 'application/zip' })
    const promise = uploadCvZipArchive(ticket(), file)
    await Promise.resolve()
    await Promise.resolve()
    const upload = currentUpload()
    expect(upload.resumeFromPreviousUpload).not.toHaveBeenCalled()
    expect(upload.start).toHaveBeenCalledTimes(1)
    upload.options.onSuccess()
    await promise
  })

  it('une reprise trouvée (rechargement pendant l’envoi) reprend depuis le morceau connu', async () => {
    FakeUpload.instances = []
    const previous = { uploadUrl: 'https://api.example/resumable/xyz' }
    FakeUpload.previousUploadsQueue = [previous]
    const file = new File(['PK'], 'archive.zip', { type: 'application/zip' })
    const promise = uploadCvZipArchive(ticket(), file)
    await Promise.resolve()
    await Promise.resolve()
    const upload = currentUpload()
    expect(upload.resumeFromPreviousUpload).toHaveBeenCalledWith(previous)
    expect(upload.start).toHaveBeenCalledTimes(1)
    upload.options.onSuccess()
    await promise
  })

  it('traduit la progression en octets vers un pourcentage', async () => {
    FakeUpload.instances = []
    const file = new File(['PK'], 'archive.zip', { type: 'application/zip' })
    const events: unknown[] = []
    const promise = uploadCvZipArchive(ticket(), file, event => events.push(event))
    const upload = currentUpload()
    upload.options.onProgress(30, 120)
    upload.options.onSuccess()
    await promise
    expect(events).toContainEqual({ phase: 'uploading', percent: 25 })
  })

  it('une coupure réseau (pas de réponse) déclenche une reprise nommée — jamais un échec', async () => {
    FakeUpload.instances = []
    const file = new File(['PK'], 'archive.zip', { type: 'application/zip' })
    const events: unknown[] = []
    const promise = uploadCvZipArchive(ticket(), file, event => events.push(event))
    const upload = currentUpload()
    const networkError = new Error('network down')
    const shouldRetry = upload.options.onShouldRetry?.(networkError, 0, { retryDelays: [0, 3000, 5000] })
    expect(shouldRetry).toBe(true)
    expect(events).toContainEqual({ phase: 'retrying', attempt: 1 })
    upload.options.onSuccess()
    await promise
  })

  it.each([
    [413, 'uploadRefusedSize'],
    [415, 'uploadRefusedType'],
    [403, 'uploadRefusedForbidden'],
  ])('un vrai refus HTTP %i ne se reprend jamais, et son message dit la CAUSE (%s)', async (status, _key) => {
    FakeUpload.instances = []
    const file = new File(['PK'], 'archive.zip', { type: 'application/zip' })
    const promise = uploadCvZipArchive(ticket(), file)
    const upload = currentUpload()
    const refused = Object.assign(new Error('refused'), {
      originalResponse: { getStatus: () => status },
    })
    const shouldRetry = upload.options.onShouldRetry?.(refused, 0, { retryDelays: [0, 3000, 5000] })
    expect(shouldRetry).toBe(false)
    upload.options.onError(refused)
    await expect(promise).rejects.toMatchObject({ status })
  })

  // Import ZIP 666 Mo (04/10/2026) — « L'envoi de l'archive vers le stockage a
  // échoué » cachait un 400 « Invalid Compact JWS » : la CAUSE se dit.
  it.each([400, 401])(
    'un refus %i ne se reprend pas et son message porte la cause rendue par le stockage',
    async status => {
      FakeUpload.instances = []
      const file = new File(['PK'], 'archive.zip', { type: 'application/zip' })
      const promise = uploadCvZipArchive(ticket(), file)
      const upload = currentUpload()
      const refused = Object.assign(new Error('refused'), {
        originalResponse: {
          getStatus: () => status,
          getBody: () =>
            JSON.stringify({ statusCode: String(status), error: 'Bad Request', message: 'Invalid Compact JWS' }),
        },
      })
      expect(upload.options.onShouldRetry?.(refused, 0, { retryDelays: [0, 3000] })).toBe(false)
      upload.options.onError(refused)
      const error = (await promise.catch((e: unknown) => e)) as { status: number; message: string }
      expect(error).toMatchObject({ status })
      expect(error.message).toContain('Invalid Compact JWS')
      expect(error.message).toContain(String(status))
    },
  )

  it('la cause rendue ne recopie jamais un jeton (JWT masqué) et reste courte', async () => {
    FakeUpload.instances = []
    const file = new File(['PK'], 'archive.zip', { type: 'application/zip' })
    const promise = uploadCvZipArchive(ticket(), file)
    const upload = currentUpload()
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl'
    const refused = Object.assign(new Error('refused'), {
      originalResponse: { getStatus: () => 400, getBody: () => `bad token ${jwt} ${'x'.repeat(500)}` },
    })
    upload.options.onError(refused)
    const error = (await promise.catch((e: unknown) => e)) as { message: string }
    expect(error.message).not.toContain(jwt)
    expect(error.message).toContain('bad token')
    expect(error.message.length).toBeLessThan(400)
  })

  it('un échec générique (réseau épuisé, sans réponse) rend le message générique avec le statut 0', async () => {
    FakeUpload.instances = []
    const file = new File(['PK'], 'archive.zip', { type: 'application/zip' })
    const promise = uploadCvZipArchive(ticket(), file)
    const upload = currentUpload()
    upload.options.onError(new Error('network exhausted'))
    await expect(promise).rejects.toMatchObject({ status: 0 })
  })
})

// Import 688 CV (04/10/2026) — 35 min de suivi ABSOLU abandonnaient un lot qui
// avançait : le suivi ne rend la main que sur un job IMMOBILE.
describe('pollCvZipLargeImport — suit tant que le job progresse', () => {
  const report = { total: 0, summary: {}, outcomes: [] } as unknown as import('@bellum/contracts').CvBatchImportReport
  const running = (processed: number) =>
    ({ state: 'running', jobId: 'j', progress: { processed, total: 688 } }) as const

  it('un job qui avance au-delà du délai d’immobilité est suivi jusqu’à son terme', async () => {
    const statuses = [
      running(1),
      running(2),
      running(3),
      running(4),
      { state: 'done', jobId: 'j', result: report } as const,
    ]
    const spy = vi.spyOn(consultantsApi, 'intakeZipLargeStatus').mockImplementation(async () => statuses.shift()!)
    // stallMs = 0 : sans la remise à zéro sur progression, le 2e tour lèverait.
    await expect(pollCvZipLargeImport('j', undefined, { intervalMs: 0, stallMs: 0 })).resolves.toBe(report)
    spy.mockRestore()
  })

  it('un téléchargement qui avance (octets reçus) n’est pas pris pour un job immobile', async () => {
    const dl = (bytes: number) =>
      ({
        state: 'running',
        jobId: 'j',
        progress: { processed: 0, total: null, phase: 'download', bytesDownloaded: bytes, bytesTotal: 900 },
      }) as const
    const statuses = [dl(100), dl(200), dl(300), { state: 'done', jobId: 'j', result: report } as const]
    const spy = vi.spyOn(consultantsApi, 'intakeZipLargeStatus').mockImplementation(async () => statuses.shift()!)
    await expect(pollCvZipLargeImport('j', undefined, { intervalMs: 0, stallMs: 0 })).resolves.toBe(report)
    spy.mockRestore()
  })

  it('un job IMMOBILE au-delà du délai rend « il continue en tâche de fond » (504)', async () => {
    const spy = vi.spyOn(consultantsApi, 'intakeZipLargeStatus').mockImplementation(async () => running(7))
    await expect(pollCvZipLargeImport('j', undefined, { intervalMs: 0, stallMs: 0 })).rejects.toMatchObject({
      status: 504,
    })
    spy.mockRestore()
  })
})
