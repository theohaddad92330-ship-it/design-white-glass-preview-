import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32 } from 'node:zlib'
import type { CvBatchFileOutcome, CvZipImportJobProgress } from '@bellum/contracts'
import {
  CV_ZIP_ENTRY_CONCURRENCY,
  flattenZipEntries,
  processCvZipEntries,
  runCvZipImportJob,
  type OpenNestedZip,
  type ZipStreamEntry,
} from './cv-zip-import.worker'
import type { CvIntakeService } from './cv-intake.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'

function entry(over: Partial<ZipStreamEntry> = {}): ZipStreamEntry {
  return {
    path: 'jean.pdf',
    type: 'File',
    lastModifiedDateTime: null,
    buffer: async () => Buffer.from('Jean Dupont'),
    ...over,
  }
}

function makeCvIntake(intakeImpl?: (input: { filename: string }) => CvBatchFileOutcome) {
  const calls: { filename: string; fileB64: string; capturedAt: Date | null }[] = []
  const intakeAutomatic = jest.fn(
    async (_ws: string, _user: string, input: { filename: string; fileB64: string; capturedAt: Date | null }) => {
      calls.push(input)
      return intakeImpl
        ? intakeImpl(input)
        : ({
            status: 'created',
            file: input.filename,
            consultantId: `c-${input.filename}`,
          } satisfies CvBatchFileOutcome)
    },
  )
  return { cvIntake: { intakeAutomatic } as unknown as CvIntakeService, calls, intakeAutomatic }
}

/**
 * #3065 (lot 2b) — la BOUCLE DE TRAITEMENT de l'import ZIP volumineux, isolée
 * de `unzipper`/du réseau : elle reçoit des ENTRÉES DÉJÀ OUVERTES (l'interface
 * `ZipStreamEntry`, que le vrai worker remplit depuis `unzipper.Open.custom`
 * en streaming depuis le stockage) et le MÊME pipeline automatique que
 * l'import en ligne (`CvBatchImportService.importZip`) — jamais une seconde
 * décision d'auto-validation ou d'exception.
 */
describe('processCvZipEntries (#3065 lot 2b)', () => {
  it('traite chaque entrée FICHIER et rend le même rapport que l’import en ligne', async () => {
    const { cvIntake, calls } = makeCvIntake()
    const report = await processCvZipEntries(
      WORKSPACE,
      USER,
      [entry({ path: 'jean.pdf' }), entry({ path: 'marie.pdf', buffer: async () => Buffer.from('Marie Martin') })],
      cvIntake,
      async () => {},
    )

    expect(report.total).toBe(2)
    expect(report.summary.created).toBe(2)
    expect(calls.map(c => c.filename)).toEqual(['jean.pdf', 'marie.pdf'])
    expect(calls.every(c => c.fileB64.length > 0)).toBe(true)
  })

  it('ignore les répertoires — jamais envoyés à `intakeAutomatic`', async () => {
    const { cvIntake, intakeAutomatic } = makeCvIntake()
    await processCvZipEntries(
      WORKSPACE,
      USER,
      [entry({ path: 'sous-dossier/', type: 'Directory' })],
      cvIntake,
      async () => {},
    )
    expect(intakeAutomatic).not.toHaveBeenCalled()
  })

  it('ignore les fichiers techniques du système — __MACOSX et .DS_Store', async () => {
    const { cvIntake, intakeAutomatic } = makeCvIntake()
    await processCvZipEntries(
      WORKSPACE,
      USER,
      [entry({ path: '__MACOSX/jean.pdf' }), entry({ path: '.DS_Store' })],
      cvIntake,
      async () => {},
    )
    expect(intakeAutomatic).not.toHaveBeenCalled()
  })

  it('transmet la date RÉELLE de l’entrée — jamais « maintenant » (#2569.2)', async () => {
    const { cvIntake, calls } = makeCvIntake()
    const capturedAt = new Date('2025-03-01T00:00:00.000Z')
    await processCvZipEntries(WORKSPACE, USER, [entry({ lastModifiedDateTime: capturedAt })], cvIntake, async () => {})
    expect(calls[0]!.capturedAt).toEqual(capturedAt)
  })

  it('un fichier illisible n’arrête pas le lot — son échec est nommé, les autres continuent', async () => {
    const { cvIntake } = makeCvIntake(input =>
      input.filename === 'corrompu.pdf'
        ? { status: 'failed', file: input.filename, reason: 'Archive illisible.', category: 'other' }
        : { status: 'created', file: input.filename, consultantId: `c-${input.filename}` },
    )
    const report = await processCvZipEntries(
      WORKSPACE,
      USER,
      [entry({ path: 'corrompu.pdf', buffer: async () => Buffer.from('corrompu') }), entry({ path: 'jean.pdf' })],
      cvIntake,
      async () => {},
    )
    expect(report.summary.failed).toBe(1)
    expect(report.summary.created).toBe(1)
  })

  it('un fichier dont l’écriture LÈVE n’arrête pas le lot — échec nommé, les autres continuent (05/10/2026)', async () => {
    const { cvIntake } = makeCvIntake(input => {
      if (input.filename === 'nul.pdf') throw new Error('invalid byte sequence for encoding "UTF8": 0x00')
      return { status: 'created', file: input.filename, consultantId: `c-${input.filename}` }
    })
    const report = await processCvZipEntries(
      WORKSPACE,
      USER,
      [entry({ path: 'nul.pdf', buffer: async () => Buffer.from('nul') }), entry({ path: 'jean.pdf' })],
      cvIntake,
      async () => {},
    )
    expect(report.summary.failed).toBe(1)
    expect(report.summary.created).toBe(1)
    expect(report.outcomes[0]).toMatchObject({ status: 'failed', file: 'nul.pdf' })
  })

  it('rend la PROGRESSION après chaque fichier — total connu dès le départ (répertoire déjà lu)', async () => {
    const { cvIntake } = makeCvIntake()
    const progressCalls: { processed: number; total: number | null }[] = []
    await processCvZipEntries(
      WORKSPACE,
      USER,
      [entry({ path: 'a.pdf' }), entry({ path: 'b.pdf' })],
      cvIntake,
      async progress => {
        progressCalls.push(progress)
      },
    )
    expect(progressCalls).toEqual([
      { processed: 1, total: 2 },
      { processed: 2, total: 2 },
    ])
  })

  it('#3303 — dédoublonne par empreinte : la seconde occurrence du même fichier est nommée « doublon », jamais retraitée', async () => {
    const { cvIntake, intakeAutomatic } = makeCvIntake()
    const report = await processCvZipEntries(
      WORKSPACE,
      USER,
      [
        entry({ path: 'jean.pdf', buffer: async () => Buffer.from('Jean Dupont') }),
        entry({ path: 'copie-jean.pdf', buffer: async () => Buffer.from('Jean Dupont') }),
        entry({ path: 'marie.pdf', buffer: async () => Buffer.from('Marie Martin') }),
      ],
      cvIntake,
      async () => {},
    )
    expect(intakeAutomatic).toHaveBeenCalledTimes(2)
    expect(report.summary.created).toBe(2)
    expect(report.summary.ignored).toBe(1)
    const duplicate = report.outcomes.find(o => o.file === 'copie-jean.pdf')
    expect(duplicate).toMatchObject({ status: 'ignored' })
  })

  it('Louis 06/10/2026 : plus aucun plafond en nombre — 2 500 entrées, 2 500 traitées, aucun « Lot trop grand »', async () => {
    const { cvIntake, intakeAutomatic } = makeCvIntake()
    const entries = Array.from({ length: 2500 }, (_, i) =>
      entry({ path: `cv-${i}.pdf`, buffer: async () => Buffer.from(`cv ${i}`) }),
    )
    const report = await processCvZipEntries(WORKSPACE, USER, entries, cvIntake, async () => {}, { concurrency: 8 })
    expect(intakeAutomatic).toHaveBeenCalledTimes(2500)
    expect(report.total).toBe(2500)
    expect(report.summary.created).toBe(2500)
    expect(report.summary.failed).toBe(0)
    expect(report.outcomes.some(o => o.status === 'failed' && /Lot trop grand/.test(o.reason ?? ''))).toBe(false)
  })

  // Import ZIP 666 Mo / 688 CV (04/10/2026) — 688 lectures EN SÉRIE dépassaient
  // la demi-heure : concurrence BORNÉE, ordre du rapport conservé.
  it('traite plusieurs fichiers en parallèle, jamais plus que la borne, et garde l’ordre du rapport', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const intakeAutomatic = jest.fn(async (_ws: string, _u: string, input: { filename: string }) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise(resolve => setTimeout(resolve, input.filename === 'f0.pdf' ? 20 : 2))
      inFlight -= 1
      return { status: 'created', file: input.filename, consultantId: `c-${input.filename}` } as CvBatchFileOutcome
    })
    const cvIntake = { intakeAutomatic } as unknown as CvIntakeService
    const entries = Array.from({ length: 10 }, (_, i) =>
      entry({ path: `f${i}.pdf`, buffer: async () => Buffer.from(`cv ${i}`) }),
    )
    const progress: number[] = []
    const report = await processCvZipEntries(
      WORKSPACE,
      USER,
      entries,
      cvIntake,
      async p => {
        progress.push(p.processed)
      },
      { concurrency: 4 },
    )
    expect(maxInFlight).toBe(4)
    expect(report.outcomes.map(o => o.file)).toEqual(entries.map(e => e.path))
    expect(progress).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('une entrée dont les octets ne se lisent pas est NOMMÉE en échec — le lot continue', async () => {
    const { cvIntake } = makeCvIntake()
    const report = await processCvZipEntries(
      WORKSPACE,
      USER,
      [
        entry({
          path: 'casse.pdf',
          buffer: async () => {
            throw new Error('invalid stored block lengths')
          },
        }),
        entry({ path: 'jean.pdf' }),
      ],
      cvIntake,
      async () => {},
    )
    expect(report.summary.created).toBe(1)
    expect(report.outcomes[0]).toMatchObject({ status: 'failed', file: 'casse.pdf' })
  })
})

/**
 * #3303 — le dépaquetage RÉCURSIF des ZIP imbriqués, isolé lui aussi de
 * `unzipper` : {@link OpenNestedZip} joue le même rôle que `ZipStreamEntry`
 * pour l'archive extérieure — une doublure posée à la main, jamais un vrai
 * ZIP en test.
 */
describe('flattenZipEntries (#3303)', () => {
  it('dépaquette une archive imbriquée et préfixe le chemin de ses entrées', async () => {
    const openNestedZip: OpenNestedZip = async () => [entry({ path: 'cv-jean.pdf' })]
    const flat = await flattenZipEntries([entry({ path: 'Candidats.zip' })], openNestedZip)
    expect(flat.map(e => e.path)).toEqual(['Candidats.zip/cv-jean.pdf'])
  })

  it('dépaquette récursivement, jusqu’à la profondeur maximale (3)', async () => {
    let calls = 0
    const openNestedZip: OpenNestedZip = async () => {
      calls += 1
      // Chaque niveau imbriqué contient lui-même un ZIP, jusqu'à ce qu'on
      // atteigne un vrai CV au dernier niveau atteignable.
      return calls < 3 ? [entry({ path: 'sous.zip' })] : [entry({ path: 'cv-jean.pdf' })]
    }
    const flat = await flattenZipEntries([entry({ path: 'niveau1.zip' })], openNestedZip)
    expect(flat.map(e => e.path)).toEqual(['niveau1.zip/sous.zip/sous.zip/cv-jean.pdf'])
  })

  it('au-delà de la profondeur maximale, l’entrée `.zip` reste TELLE QUELLE — jamais perdue', async () => {
    const openNestedZip: OpenNestedZip = async () => [entry({ path: 'encore.zip' })]
    const flat = await flattenZipEntries([entry({ path: 'niveau1.zip' })], openNestedZip, 1, 1)
    expect(flat.map(e => e.path)).toEqual(['niveau1.zip/encore.zip'])
  })

  it('ne charge JAMAIS l’archive imbriquée en mémoire — l’ouvreur reçoit l’entrée, pas ses octets (#3481)', async () => {
    // Une archive imbriquée de plusieurs centaines de Mo ne doit pas passer par
    // `buffer()` : c'est ce qui faisait tomber l'import d'une archive de 600 Mo.
    const buffer = jest.fn(async () => Buffer.from('x'))
    const openNestedZip = jest.fn<ReturnType<OpenNestedZip>, Parameters<OpenNestedZip>>(async () => [
      entry({ path: 'cv-jean.pdf' }),
    ])
    const nested = entry({ path: 'Candidats.zip', buffer })
    await flattenZipEntries([nested], openNestedZip)
    expect(buffer).not.toHaveBeenCalled()
    expect(openNestedZip).toHaveBeenCalledWith(nested)
  })

  it('laisse un fichier normal inchangé — aucun appel à `openNestedZip`', async () => {
    const openNestedZip = jest.fn<ReturnType<OpenNestedZip>, Parameters<OpenNestedZip>>()
    const flat = await flattenZipEntries([entry({ path: 'cv-jean.pdf' })], openNestedZip)
    expect(flat).toEqual([expect.objectContaining({ path: 'cv-jean.pdf' })])
    expect(openNestedZip).not.toHaveBeenCalled()
  })
})

/**
 * Un VRAI ZIP (méthode « stored », sans compression), construit octet par
 * octet : en-têtes locaux, répertoire central, fin de répertoire. Aucune
 * dépendance de plus — juste assez pour que `unzipper` l'ouvre comme
 * l'archive déposée en production.
 */
function buildStoredZip(files: readonly { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const crc = crc32(file.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(file.data.length, 18)
    local.writeUInt32LE(file.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(file.data.length, 20)
    central.writeUInt32LE(file.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, name, file.data)
    centrals.push(central, name)
    offset += local.length + name.length + file.data.length
  }
  const centralDirectory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralDirectory, end])
}

function cvFiles(count: number): { name: string; data: Buffer }[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `cv-${i}.pdf`,
    data: Buffer.from(`CV numéro ${i} `.repeat(50)),
  }))
}

/** Une source de stockage qui COMPTE ce qu'on lui demande — et l'en-tête `Range` de chaque lecture. */
function storageSource(zip: Buffer, init: { status?: number } = {}) {
  const reads: { url: string; range: string | null }[] = []
  const fetchArchive = jest.fn(async (url: string, options?: RequestInit) => {
    const headers = new Headers(options?.headers)
    reads.push({ url, range: headers.get('range') })
    return new Response(init.status && init.status >= 400 ? 'refusé' : new Uint8Array(zip), {
      status: init.status ?? 200,
      headers: { 'content-length': String(zip.length) },
    })
  })
  return { fetchArchive, reads }
}

function fakeJob(data: Partial<{ workspaceId: string; userId: string; path: string; filename: string }> = {}) {
  const progress: CvZipImportJobProgress[] = []
  return {
    progress,
    job: {
      data: {
        workspaceId: WORKSPACE,
        userId: USER,
        path: `${WORKSPACE}/cv-zip-import/a.zip`,
        filename: 'a.zip',
        ...data,
      },
      updateProgress: jest.fn(async (p: unknown) => {
        progress.push(p as CvZipImportJobProgress)
      }),
    },
  }
}

function fakeStorage() {
  return {
    signedUrl: jest.fn(async () => 'https://stockage.test/archive.zip?token=t'),
    remove: jest.fn(async () => true),
  }
}

/**
 * Incident 05/10/2026 — un job `cv-zip-import` (archive ~666 Mo) affamait la
 * boucle Node de l'API pendant 23 min SANS traiter un seul fichier. Cause :
 * `unzipper` appelle `source.stream(offset)` SANS longueur ; l'ancienne source
 * envoyait `Range: bytes=<offset>-NaN`, un en-tête invalide que le stockage
 * ignore → l'archive ENTIÈRE revenait à chaque lecture, et la recherche de la
 * fin de répertoire la concaténait en mémoire (quadratique, synchrone).
 * Désormais : UN téléchargement en flux vers un fichier temporaire, puis
 * l'archive s'ouvre en local.
 */
describe('runCvZipImportJob — incident boucle API (05/10/2026)', () => {
  let tmpRoot: string
  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'cv-zip-spec-'))
  })
  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('(a) télécharge l’archive UNE fois, sans `Range`, puis l’ouvre en local — tous les CV sont traités', async () => {
    const zip = buildStoredZip(cvFiles(12))
    const { fetchArchive, reads } = storageSource(zip)
    const { cvIntake, calls } = makeCvIntake()
    const { job } = fakeJob()
    const report = await runCvZipImportJob(job, { storage: fakeStorage(), cvIntake, fetchArchive, tmpRoot })

    expect(reads).toHaveLength(1)
    expect(reads[0]!.range).toBeNull()
    expect(report.summary.created).toBe(12)
    expect(calls.map(c => c.filename)).toEqual(cvFiles(12).map(f => f.name))
    expect(Buffer.from(calls[3]!.fileB64, 'base64').toString()).toBe(cvFiles(12)[3]!.data.toString())
  })

  it('(f) publie une progression PENDANT le téléchargement et l’ouverture, avant le premier CV', async () => {
    const zip = buildStoredZip(cvFiles(3))
    const { fetchArchive } = storageSource(zip)
    const { cvIntake } = makeCvIntake()
    const { job, progress } = fakeJob()
    await runCvZipImportJob(job, { storage: fakeStorage(), cvIntake, fetchArchive, tmpRoot })

    const phases = progress.map(p => p.phase)
    expect(phases[0]).toBe('download')
    expect(phases).toContain('open')
    expect(phases.indexOf('open')).toBeLessThan(phases.indexOf('entries'))
    const downloaded = progress.filter(p => p.phase === 'download').at(-1)
    expect(downloaded).toMatchObject({ processed: 0, total: null, bytesDownloaded: zip.length, bytesTotal: zip.length })
    expect(progress.at(-1)).toMatchObject({ phase: 'entries', processed: 3, total: 3 })
  })

  it('(g) supprime le fichier temporaire en SUCCÈS', async () => {
    const { fetchArchive } = storageSource(buildStoredZip(cvFiles(2)))
    const { cvIntake } = makeCvIntake()
    const storage = fakeStorage()
    await runCvZipImportJob(fakeJob().job, { storage, cvIntake, fetchArchive, tmpRoot })
    expect(await readdir(tmpRoot)).toEqual([])
    expect(storage.remove).toHaveBeenCalledTimes(1)
  })

  it('(g) supprime le fichier temporaire en ÉCHEC — le stockage refuse la lecture', async () => {
    const { fetchArchive } = storageSource(buildStoredZip(cvFiles(2)), { status: 500 })
    const { cvIntake } = makeCvIntake()
    const storage = fakeStorage()
    await expect(runCvZipImportJob(fakeJob().job, { storage, cvIntake, fetchArchive, tmpRoot })).rejects.toThrow()
    expect(await readdir(tmpRoot)).toEqual([])
    expect(storage.remove).toHaveBeenCalledTimes(1)
  })

  it('(g) supprime le fichier temporaire en ÉCHEC — l’archive est illisible', async () => {
    const { fetchArchive } = storageSource(Buffer.from('ceci n’est pas un zip'.repeat(20)))
    const { cvIntake } = makeCvIntake()
    await expect(
      runCvZipImportJob(fakeJob().job, { storage: fakeStorage(), cvIntake, fetchArchive, tmpRoot }),
    ).rejects.toThrow()
    expect(await readdir(tmpRoot)).toEqual([])
  })

  it('(e) ouvre le contexte de lot (vivier indexé) UNE fois par job, transmis à chaque CV', async () => {
    const { fetchArchive } = storageSource(buildStoredZip(cvFiles(5)))
    const { cvIntake, intakeAutomatic } = makeCvIntake()
    const batch = { identities: { marker: 'index-du-job' } }
    const openAutomaticBatch = jest.fn(async () => batch)
    ;(cvIntake as unknown as { openAutomaticBatch: typeof openAutomaticBatch }).openAutomaticBatch = openAutomaticBatch
    await runCvZipImportJob(fakeJob().job, { storage: fakeStorage(), cvIntake, fetchArchive, tmpRoot })

    expect(openAutomaticBatch).toHaveBeenCalledTimes(1)
    expect(openAutomaticBatch).toHaveBeenCalledWith(WORKSPACE)
    expect(intakeAutomatic).toHaveBeenCalledTimes(5)
    for (const call of intakeAutomatic.mock.calls) expect((call as unknown[])[3]).toBe(batch)
  })
})

describe('processCvZipEntries — la boucle reste réactive (05/10/2026)', () => {
  it('(b) un CV à la fois par défaut', async () => {
    expect(CV_ZIP_ENTRY_CONCURRENCY).toBe(1)
    let inFlight = 0
    let maxInFlight = 0
    const intakeAutomatic = jest.fn(async (_ws: string, _u: string, input: { filename: string }) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise(resolve => setTimeout(resolve, 2))
      inFlight -= 1
      return { status: 'created', file: input.filename, consultantId: `c-${input.filename}` } as CvBatchFileOutcome
    })
    const entries = Array.from({ length: 6 }, (_, i) =>
      entry({ path: `f${i}.pdf`, buffer: async () => Buffer.from(`cv ${i}`) }),
    )
    await processCvZipEntries(
      WORKSPACE,
      USER,
      entries,
      { intakeAutomatic } as unknown as CvIntakeService,
      async () => {},
    )
    expect(maxInFlight).toBe(1)
  })

  it('(c) rend la main à la boucle entre deux CV — un `setImmediate` posé au départ passe avant la fin', async () => {
    // Doublures 100 % microtâches : sans cession explicite, la boucle entière
    // tournerait sans jamais laisser passer une phase « check ».
    const { cvIntake } = makeCvIntake()
    const entries = Array.from({ length: 50 }, (_, i) =>
      entry({ path: `f${i}.pdf`, buffer: async () => Buffer.from(`cv ${i}`) }),
    )
    const order: string[] = []
    setImmediate(() => order.push('immediate'))
    await processCvZipEntries(WORKSPACE, USER, entries, cvIntake, async () => {})
    order.push('job-fini')
    expect(order).toEqual(['immediate', 'job-fini'])
  })

  it('(d) les issues gardées ne retiennent NI octets NI texte — seulement le résumé', async () => {
    const { cvIntake } = makeCvIntake(
      input =>
        ({
          status: 'created',
          file: input.filename,
          consultantId: `c-${input.filename}`,
          text: 'tout le texte du CV '.repeat(1000),
          fileB64: 'QUJD'.repeat(1000),
          bytes: Buffer.alloc(1024),
        }) as unknown as CvBatchFileOutcome,
    )
    const report = await processCvZipEntries(WORKSPACE, USER, [entry({ path: 'jean.pdf' })], cvIntake, async () => {})
    expect(report.outcomes[0]).toEqual({ status: 'created', file: 'jean.pdf', consultantId: 'c-jean.pdf' })
  })
})
