import AdmZip from 'adm-zip'
import { BadRequestException, NotFoundException, PayloadTooLargeException } from '@nestjs/common'
import type { Queue } from 'bullmq'
import type { Repository } from 'typeorm'
import { CV_ZIP_MAX_ARCHIVE_BYTES, type CvBatchFileOutcome } from '@bellum/contracts'
import { CvBatchImportService } from './cv-batch-import.service'
import type { CvIntakeService } from './cv-intake.service'
import type { MailboxService } from '../mailbox/mailbox.service'
import type { CvBatchImportJobEntity } from '../../database/entities/cv-batch-import-job.entity'
import type { CvBatchImportJobData } from './cv-batch-import.queue'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'

function zipOf(files: { name: string; content: string; date?: Date }[]): string {
  const zip = new AdmZip()
  for (const file of files) {
    zip.addFile(file.name, Buffer.from(file.content, 'utf8'))
    if (file.date) {
      const entry = zip.getEntry(file.name)
      if (entry) entry.header.time = file.date
    }
  }
  return zip.toBuffer().toString('base64')
}

function makeService(intakeImpl?: (input: { filename: string; capturedAt: Date | null }) => CvBatchFileOutcome) {
  const calls: { filename: string; capturedAt: Date | null }[] = []
  const intakeAutomatic = jest.fn(
    async (
      _ws: string,
      _user: string,
      input: { filename: string; fileB64: string; capturedAt: Date | null },
      _batch?: unknown,
    ) => {
      calls.push({ filename: input.filename, capturedAt: input.capturedAt })
      return intakeImpl
        ? intakeImpl(input)
        : ({
            status: 'created',
            file: input.filename,
            consultantId: `c-${input.filename}`,
          } satisfies CvBatchFileOutcome)
    },
  )
  // Incident 05/10/2026 — le vivier d'un lot est ouvert UNE fois (un objet reconnaissable).
  const openedBatch = { identities: { find: jest.fn(), remember: jest.fn() } }
  const openAutomaticBatch = jest.fn(async (_ws: string) => openedBatch)
  const cvIntake = { intakeAutomatic, openAutomaticBatch } as unknown as CvIntakeService
  const getAttachment = jest.fn(
    async () =>
      ({
        filename: 'cv.pdf',
        mimeType: 'application/pdf',
        dataB64: Buffer.from('CV').toString('base64'),
        messageDate: '2025-03-01T00:00:00.000Z',
      }) as const,
  )
  const mailbox = { getAttachment } as unknown as MailboxService
  // #2326.12 — l'orchestrateur async n'est pas exercé par ces tests
  // (`enqueueZip`/`enqueueFiles`/`getJobState` ont leur propre suite,
  // `cv-batch-import.worker.spec.ts`) : des bouchons suffisent ici.
  const jobs = {
    create: jest.fn(input => input),
    save: jest.fn(async (input: unknown) => ({ id: 'job-0', ...(input as object) })),
    findOne: jest.fn(),
    update: jest.fn(),
  } as unknown as Repository<CvBatchImportJobEntity>
  const queue = { add: jest.fn() } as unknown as Queue<CvBatchImportJobData>
  return {
    service: new CvBatchImportService(cvIntake, mailbox, jobs, queue),
    calls,
    intakeAutomatic,
    getAttachment,
    openAutomaticBatch,
    openedBatch,
  }
}

// #2569.1 — import d'une archive ZIP entière.
describe('CvBatchImportService.importZip', () => {
  it('traite chaque fichier du zip et rend un rapport avec le compte par issue', async () => {
    const { service } = makeService()
    const fileB64 = zipOf([
      { name: 'jean.pdf', content: 'Jean Dupont' },
      { name: 'marie.pdf', content: 'Marie Martin' },
    ])
    const report = await service.importZip(WORKSPACE, USER, fileB64)

    expect(report.total).toBe(2)
    expect(report.summary.created).toBe(2)
    expect(report.outcomes.map(o => o.file).sort()).toEqual(['jean.pdf', 'marie.pdf'])
  })

  it('#2569.2 — transmet la date RÉELLE de chaque entrée (le dernier modifié du zip), jamais « maintenant »', async () => {
    const { service, calls } = makeService()
    const date = new Date('2023-05-01T00:00:00.000Z')
    const fileB64 = zipOf([{ name: 'jean.pdf', content: 'Jean Dupont', date }])
    await service.importZip(WORKSPACE, USER, fileB64)

    expect(calls[0]?.capturedAt?.getFullYear()).toBe(2023)
  })

  it('ignore les entrées de répertoire — un dossier n’est pas un CV', async () => {
    const { service, calls } = makeService()
    const zip = new AdmZip()
    zip.addFile('dossier/', Buffer.alloc(0))
    zip.addFile('dossier/jean.pdf', Buffer.from('Jean Dupont'))
    const report = await service.importZip(WORKSPACE, USER, zip.toBuffer().toString('base64'))

    expect(report.total).toBe(1)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.filename).toBe('dossier/jean.pdf')
  })

  it('un fichier illisible n’arrête pas le lot — chaque échec porte SA raison', async () => {
    const { service } = makeService(input =>
      input.filename === 'corrompu.pdf'
        ? { status: 'failed', file: input.filename, reason: 'Probablement un scan', category: 'other' }
        : { status: 'created', file: input.filename, consultantId: 'c1' },
    )
    const fileB64 = zipOf([
      { name: 'corrompu.pdf', content: 'x' },
      { name: 'jean.pdf', content: 'Jean Dupont' },
    ])
    const report = await service.importZip(WORKSPACE, USER, fileB64)

    expect(report.total).toBe(2)
    expect(report.summary.failed).toBe(1)
    expect(report.summary.created).toBe(1)
  })

  it('refuse une archive illisible avec une erreur NOMMÉE, sans planter', async () => {
    const { service } = makeService()
    await expect(service.importZip(WORKSPACE, USER, Buffer.from('pas un zip').toString('base64'))).rejects.toThrow(
      BadRequestException,
    )
  })

  // #3065 — au-delà de CV_ZIP_MAX_ARCHIVE_BYTES, un refus NOMMÉ (413), avant
  // même de tenter d'ouvrir l'archive : c'est la limite de transport qui a
  // laissé passer un fichier plus gros que la borne annoncée au navigateur.
  it('#3065 — refuse une archive plus grande que CV_ZIP_MAX_ARCHIVE_BYTES avec un 413 NOMMÉ', async () => {
    const { service } = makeService()
    const tooBig = Buffer.alloc(CV_ZIP_MAX_ARCHIVE_BYTES + 1024, 'a').toString('base64')
    await expect(service.importZip(WORKSPACE, USER, tooBig)).rejects.toThrow(PayloadTooLargeException)
  })

  // Incident boucle API (05/10/2026) — le vivier n'est plus relu à chaque CV.
  it('charge le vivier UNE fois par lot et le passe à chaque CV, doublons compris', async () => {
    const { service, intakeAutomatic, openAutomaticBatch, openedBatch } = makeService()
    const files = [
      { name: 'jean.pdf', content: 'CV jean' },
      { name: 'jean-bis.pdf', content: 'CV jean' },
      { name: 'paul.pdf', content: 'CV paul' },
    ]
    const report = await service.importZip(WORKSPACE, USER, zipOf(files))

    expect(openAutomaticBatch).toHaveBeenCalledTimes(1)
    expect(openAutomaticBatch).toHaveBeenCalledWith(WORKSPACE)
    expect(intakeAutomatic).toHaveBeenCalledTimes(3)
    for (const call of intakeAutomatic.mock.calls) expect(call[3]).toBe(openedBatch)
    // Mêmes issues qu'avant : une par fichier.
    expect(report.outcomes.map(o => o.file).sort()).toEqual(['jean-bis.pdf', 'jean.pdf', 'paul.pdf'])
  })

  it('Louis 06/10/2026 : plus aucun plafond en nombre — 305 fichiers, 305 traités, aucun « lot trop grand »', async () => {
    const { service, intakeAutomatic } = makeService()
    const files = Array.from({ length: 305 }, (_, i) => ({ name: `cv-${i}.pdf`, content: `CV ${i}` }))
    const report = await service.importZip(WORKSPACE, USER, zipOf(files))

    expect(intakeAutomatic).toHaveBeenCalledTimes(305)
    expect(report.total).toBe(305)
    expect(report.outcomes.some(o => o.status === 'failed' && /Lot trop grand/.test(o.reason ?? ''))).toBe(false)
  })
})

// #2431.6 (épopée #2883) — le manifeste, lu AVANT tout traitement, sans écrire une seule fiche.
describe('CvBatchImportService.previewZip', () => {
  it('compte les fichiers sans appeler le dépôt automatique — aucune écriture', async () => {
    const { service, intakeAutomatic } = makeService()
    const fileB64 = zipOf([
      { name: 'jean.pdf', content: 'Jean Dupont' },
      { name: 'marie.pdf', content: 'Marie Martin' },
    ])
    const manifest = await service.previewZip(fileB64)

    expect(manifest).toEqual({ totalFiles: 2, duplicateFiles: 0 })
    expect(intakeAutomatic).not.toHaveBeenCalled()
  })

  it('compte un doublon par contenu identique, jamais par nom de fichier', async () => {
    const { service } = makeService()
    const fileB64 = zipOf([
      { name: 'jean.pdf', content: 'Jean Dupont' },
      { name: 'jean (1).pdf', content: 'Jean Dupont' },
    ])
    const manifest = await service.previewZip(fileB64)

    expect(manifest.totalFiles).toBe(2)
    expect(manifest.duplicateFiles).toBe(1)
  })

  it('Louis 06/10/2026 : le manifeste ne porte plus de borne', async () => {
    const { service, intakeAutomatic } = makeService()
    const files = Array.from({ length: 305 }, (_, i) => ({ name: `cv-${i}.pdf`, content: `CV ${i}` }))
    const manifest = await service.previewZip(zipOf(files))

    expect(manifest).toEqual({ totalFiles: 305, duplicateFiles: 0 })
    expect(intakeAutomatic).not.toHaveBeenCalled()
  })

  it('refuse une archive illisible avec une erreur NOMMÉE, sans planter', async () => {
    const { service } = makeService()
    await expect(service.previewZip(Buffer.from('pas un zip').toString('base64'))).rejects.toThrow(BadRequestException)
  })
})

// #2326.6 (épopée #2794) — un DOSSIER entier de CV, hors d'une archive ZIP.
// Même pipeline automatique que le ZIP, mais les octets arrivent déjà séparés
// (pas d'entrées à dépaqueter).
describe('CvBatchImportService.importFiles', () => {
  it('traite chaque fichier du dossier et rend un rapport avec le compte par issue', async () => {
    const { service } = makeService()
    const files = [
      { filename: 'jean.pdf', fileB64: Buffer.from('Jean Dupont').toString('base64') },
      { filename: 'marie.pdf', fileB64: Buffer.from('Marie Martin').toString('base64') },
    ]
    const report = await service.importFiles(WORKSPACE, USER, files)

    expect(report.total).toBe(2)
    expect(report.summary.created).toBe(2)
    expect(report.outcomes.map(o => o.file).sort()).toEqual(['jean.pdf', 'marie.pdf'])
  })

  it('garde le chemin RELATIF d’un sous-dossier tel que le navigateur le donne', async () => {
    const { service, calls } = makeService()
    await service.importFiles(WORKSPACE, USER, [
      { filename: 'lot-2026/jean.pdf', fileB64: Buffer.from('Jean Dupont').toString('base64') },
    ])
    expect(calls[0]?.filename).toBe('lot-2026/jean.pdf')
  })

  it('un fichier illisible n’arrête pas le lot — chaque échec porte SA raison', async () => {
    const { service } = makeService(input =>
      input.filename === 'corrompu.pdf'
        ? { status: 'failed', file: input.filename, reason: 'Probablement un scan', category: 'other' }
        : { status: 'created', file: input.filename, consultantId: 'c1' },
    )
    const report = await service.importFiles(WORKSPACE, USER, [
      { filename: 'corrompu.pdf', fileB64: Buffer.from('x').toString('base64') },
      { filename: 'jean.pdf', fileB64: Buffer.from('Jean Dupont').toString('base64') },
    ])

    expect(report.total).toBe(2)
    expect(report.summary.failed).toBe(1)
    expect(report.summary.created).toBe(1)
  })

  it('Louis 06/10/2026 : plus aucun plafond en nombre — 305 fichiers, 305 traités', async () => {
    const { service, intakeAutomatic } = makeService()
    const files = Array.from({ length: 305 }, (_, i) => ({
      filename: `cv-${i}.pdf`,
      fileB64: Buffer.from(`CV ${i}`).toString('base64'),
    }))
    const report = await service.importFiles(WORKSPACE, USER, files)

    expect(intakeAutomatic).toHaveBeenCalledTimes(305)
    expect(report.total).toBe(305)
    expect(report.summary.failed).toBe(0)
  })
})

// #2326.6 (épopée #2794) — le manifeste d'un dossier, même discipline que le ZIP.
describe('CvBatchImportService.previewFiles', () => {
  it('compte les fichiers sans appeler le dépôt automatique — aucune écriture', async () => {
    const { service, intakeAutomatic } = makeService()
    const manifest = await service.previewFiles([
      { filename: 'jean.pdf', fileB64: Buffer.from('Jean Dupont').toString('base64') },
      { filename: 'marie.pdf', fileB64: Buffer.from('Marie Martin').toString('base64') },
    ])

    expect(manifest).toEqual({ totalFiles: 2, duplicateFiles: 0 })
    expect(intakeAutomatic).not.toHaveBeenCalled()
  })

  it('compte un doublon par contenu identique, jamais par nom de fichier', async () => {
    const { service } = makeService()
    const manifest = await service.previewFiles([
      { filename: 'jean.pdf', fileB64: Buffer.from('Jean Dupont').toString('base64') },
      { filename: 'jean (1).pdf', fileB64: Buffer.from('Jean Dupont').toString('base64') },
    ])

    expect(manifest.totalFiles).toBe(2)
    expect(manifest.duplicateFiles).toBe(1)
  })

  it('Louis 06/10/2026 : le manifeste ne porte plus de borne', async () => {
    const { service, intakeAutomatic } = makeService()
    const files = Array.from({ length: 305 }, (_, i) => ({
      filename: `cv-${i}.pdf`,
      fileB64: Buffer.from(`CV ${i}`).toString('base64'),
    }))
    const manifest = await service.previewFiles(files)

    expect(manifest).toEqual({ totalFiles: 305, duplicateFiles: 0 })
    expect(intakeAutomatic).not.toHaveBeenCalled()
  })
})

// #2568.1 — une pièce jointe d'un fil autorisé devient une fiche du vivier.
describe('CvBatchImportService.importFromMailAttachment', () => {
  it('télécharge la pièce jointe et la fait suivre au dépôt automatique, avec la date du MESSAGE', async () => {
    const { service, calls, getAttachment } = makeService()
    const outcome = await service.importFromMailAttachment(WORKSPACE, USER, 'm1', 'a1')

    expect(getAttachment).toHaveBeenCalledWith(USER, 'm1', 'a1')
    expect(outcome).toMatchObject({ status: 'created', file: 'cv.pdf' })
    expect(calls[0]?.capturedAt?.toISOString()).toBe('2025-03-01T00:00:00.000Z')
  })

  it('rend un échec NOMMÉ quand la pièce jointe n’est plus lisible — jamais une fiche vide', async () => {
    const cvIntake = { intakeAutomatic: jest.fn() } as unknown as CvIntakeService
    const mailbox = { getAttachment: jest.fn(async () => null) } as unknown as MailboxService
    const jobs = {} as unknown as Repository<CvBatchImportJobEntity>
    const queue = {} as unknown as Queue<CvBatchImportJobData>
    const service = new CvBatchImportService(cvIntake, mailbox, jobs, queue)

    const outcome = await service.importFromMailAttachment(WORKSPACE, USER, 'm1', 'a1')
    expect(outcome.status).toBe('failed')
    expect(outcome).toMatchObject({ category: 'other' })
    expect(cvIntake.intakeAutomatic).not.toHaveBeenCalled()
  })
})

// #2326.12 (épopée #2794) — L'ORCHESTRATEUR ASYNCHRONE : `enqueueZip`/
// `enqueueFiles` déposent un job et rendent la main IMMÉDIATEMENT, au lieu de
// boucler dans la requête HTTP. Le worker (traitement RÉEL, fichier par
// fichier) a sa propre suite : `cv-batch-import.worker.spec.ts`.
describe('CvBatchImportService.enqueueZip / enqueueFiles / getJobState', () => {
  function makeQueueableService() {
    const savedRows: Record<string, unknown>[] = []
    const jobs = {
      create: jest.fn((input: Record<string, unknown>) => input),
      save: jest.fn(async (input: Record<string, unknown>) => {
        const row = { id: `job-${savedRows.length}`, ...input }
        savedRows.push(row)
        return row
      }),
      findOne: jest.fn(async ({ where }: { where: { id: string; workspace_id: string } }) =>
        savedRows.find(row => row.id === where.id && row.workspace_id === where.workspace_id),
      ),
      find: jest.fn(async ({ where, order, take }: { where: { workspace_id: string }; order: unknown; take: number }) =>
        savedRows
          .filter(row => row.workspace_id === where.workspace_id)
          .slice()
          .reverse() // les lignes les plus récentes sont poussées en dernier dans `savedRows`
          .slice(0, take),
      ),
    } as unknown as Repository<CvBatchImportJobEntity>
    const add = jest.fn()
    const queue = { add } as unknown as Queue<CvBatchImportJobData>
    const cvIntake = { intakeAutomatic: jest.fn() } as unknown as CvIntakeService
    const mailbox = {} as unknown as MailboxService
    return { service: new CvBatchImportService(cvIntake, mailbox, jobs, queue), add, savedRows }
  }

  it('dépose un job ZIP et rend la main SANS attendre le traitement — aucun appel à intakeAutomatic ici', async () => {
    const { service, add } = makeQueueableService()
    const fileB64 = zipOf([
      { name: 'jean.pdf', content: 'Jean Dupont' },
      { name: 'marie.pdf', content: 'Marie Martin' },
    ])

    const { jobId, total } = await service.enqueueZip(WORKSPACE, USER, fileB64)

    expect(total).toBe(2)
    expect(jobId).toBeTruthy()
    expect(add).toHaveBeenCalledTimes(1)
    const [, payload] = add.mock.calls[0] as [string, CvBatchImportJobData]
    expect(payload.entries.map(entry => entry.filename).sort()).toEqual(['jean.pdf', 'marie.pdf'])
  })

  it('Louis 06/10/2026 : plus aucun plafond en nombre — 305 fichiers déposés en UN job', async () => {
    const { service, add } = makeQueueableService()
    const files = Array.from({ length: 305 }, (_, i) => ({ name: `cv-${i}.pdf`, content: `CV ${i}` }))

    const { total } = await service.enqueueZip(WORKSPACE, USER, zipOf(files))
    expect(total).toBe(305)
    expect(add).toHaveBeenCalledTimes(1)
  })

  it('dépose un job DOSSIER (#2326.6) — même discipline que le ZIP', async () => {
    const { service, add } = makeQueueableService()
    const { total } = await service.enqueueFiles(WORKSPACE, USER, [{ filename: 'paul.pdf', fileB64: 'YQ==' }])

    expect(total).toBe(1)
    const [, payload] = add.mock.calls[0] as [string, CvBatchImportJobData]
    expect(payload.kind).toBe('files')
    expect(payload.entries[0]).toMatchObject({ filename: 'paul.pdf', capturedAtMs: null })
  })

  it('rend l’état persisté d’un job, scopé par espace — jamais celui d’un autre espace', async () => {
    const { service } = makeQueueableService()
    const { jobId } = await service.enqueueFiles(WORKSPACE, USER, [{ filename: 'paul.pdf', fileB64: 'YQ==' }])

    const state = await service.getJobState(WORKSPACE, jobId)
    expect(state).toMatchObject({ id: jobId, status: 'queued', total: 1, processed: 0, outcomes: [] })

    await expect(service.getJobState('autre-espace', jobId)).rejects.toThrow(NotFoundException)
  })

  // #1952.4 (épopée #2844, lot V15 28/09) — Laura peut désormais LIRE l'état
  // d'un import de CV en lot déjà lancé depuis l'écran ; elle ne peut
  // toujours pas en LANCER un (la conversation ne transporte aucun fichier,
  // absence structurelle inchangée). `listRecentJobs` est la lecture que
  // `laura/import-overview` relaie — jamais un second calcul de l'état.
  it('listRecentJobs — les jobs les plus RÉCENTS de l’espace, jamais ceux d’un autre espace', async () => {
    const { service } = makeQueueableService()
    await service.enqueueFiles(WORKSPACE, USER, [{ filename: 'paul.pdf', fileB64: 'YQ==' }])
    await service.enqueueFiles(WORKSPACE, USER, [{ filename: 'alix.pdf', fileB64: 'YQ==' }])
    await service.enqueueFiles('autre-espace', USER, [{ filename: 'hors-espace.pdf', fileB64: 'YQ==' }])

    const recent = await service.listRecentJobs(WORKSPACE, 5)

    expect(recent).toHaveLength(2)
    for (const job of recent) expect(job).toMatchObject({ status: 'queued', total: 1, processed: 0 })
  })

  it('listRecentJobs — respecte la limite demandée', async () => {
    const { service } = makeQueueableService()
    await service.enqueueFiles(WORKSPACE, USER, [{ filename: 'a.pdf', fileB64: 'YQ==' }])
    await service.enqueueFiles(WORKSPACE, USER, [{ filename: 'b.pdf', fileB64: 'YQ==' }])
    await service.enqueueFiles(WORKSPACE, USER, [{ filename: 'c.pdf', fileB64: 'YQ==' }])

    const recent = await service.listRecentJobs(WORKSPACE, 2)

    expect(recent).toHaveLength(2)
  })

  // #1952.22 (épopée #2844) — getJobState porte l'ETA calculée depuis les
  // MÊMES horodatages persistés que le worker écrit déjà (`created_at` à
  // l'enqueue, `updated_at` bumpée à chaque `processed_count` — même ligne,
  // aucune nouvelle table).
  it('getJobState — calcule l’ETA depuis le débit déjà mesuré sur cette ligne', async () => {
    const { service, savedRows } = makeQueueableService()
    const { jobId } = await service.enqueueFiles(WORKSPACE, USER, [
      { filename: 'a.pdf', fileB64: 'YQ==' },
      { filename: 'b.pdf', fileB64: 'YQ==' },
      { filename: 'c.pdf', fileB64: 'YQ==' },
      { filename: 'd.pdf', fileB64: 'YQ==' },
    ])
    const row = savedRows.find(r => r.id === jobId)!
    const createdAt = new Date('2026-09-28T10:00:00.000Z')
    Object.assign(row, {
      status: 'processing',
      processed_count: 1,
      created_at: createdAt,
      updated_at: new Date(createdAt.getTime() + 10_000), // 1 fichier en 10s
    })

    const state = await service.getJobState(WORKSPACE, jobId)

    expect(state.etaSeconds).toBe(30) // 3 fichiers restants × 10s
  })

  it('getJobState — jamais d’ETA devinée avant qu’aucun fichier n’ait été traité', async () => {
    const { service } = makeQueueableService()
    const { jobId } = await service.enqueueFiles(WORKSPACE, USER, [{ filename: 'a.pdf', fileB64: 'YQ==' }])

    const state = await service.getJobState(WORKSPACE, jobId)

    expect(state.etaSeconds).toBeNull()
  })
})
