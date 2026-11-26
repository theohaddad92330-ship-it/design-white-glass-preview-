import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { type Job } from 'bullmq'
import { Open } from 'unzipper'
import {
  classifyCvExtractFailure,
  isCvZipNestedArchiveEntry,
  isCvZipNoiseEntry,
  summariseCvBatchImport,
  CV_ZIP_NESTED_MAX_DEPTH,
  type CvBatchFileOutcome,
  type CvBatchImportReport,
  type CvZipImportJobProgress,
} from '@bellum/contracts'
import { StorageClient } from '../storage/storage.client'
import { Correlated } from '../../correlation-id/background-correlation'
import { CV_ZIP_IMPORT_QUEUE, type CvZipImportJobData } from './cv-zip-import.queue'
import { CvIntakeService, type CvIntakeAutomaticBatch } from './cv-intake.service'

/** Le temps qu'une lecture de l'archive tient — un lot de 688 fichiers (le cas
 *  réel qui a ouvert #3065) peut dépasser largement le verrou par défaut. */
// 04/10/2026 — 2 → 1 : une archive à la fois par processus ; à l'intérieur,
// `CV_ZIP_ENTRY_CONCURRENCY` entrées en vol (1 depuis l'incident du
// 05/10/2026). Le slot rendu au cliquet GA-303 est celui de la file
// `cv-auto-parse`.
const WORKER_OPTIONS = { concurrency: 1, lockDuration: 30 * 60_000 }
// NB (04/10/2026) : `lockDuration` n'est PAS un plafond de durée du job —
// BullMQ renouvelle le verrou toutes les `lockDuration / 2` tant que le
// processus vit ; seul un processus mort libère le job (« stalled »).

/** Fichiers d'UNE archive lus en parallèle — UN par défaut (incident boucle API
 *  du 05/10/2026) : ce job tourne DANS le processus de l'API, chaque fichier
 *  en vol garde ses octets, leur base64 et l'appel IA ; la mémoire ne doit
 *  jamais croître avec le nombre de CV. (Était 4 depuis le 04/10.) */
export const CV_ZIP_ENTRY_CONCURRENCY = 1

/** L'URL de lecture signée sert au SEUL téléchargement (incident 05/10/2026 :
 *  plus aucune lecture `Range` pendant le traitement) ; 6 h couvrent le pire
 *  téléchargement avec marge. L'objet est un fichier de TRAVAIL effacé en fin
 *  de job. */
const READ_URL_TTL_SECONDS = 6 * 60 * 60

/** Une progression de téléchargement tous les N octets — assez pour que
 *  l'écran bouge, jamais une écriture Redis par morceau réseau. */
const DOWNLOAD_PROGRESS_STEP_BYTES = 8 * 1024 * 1024

/** Rend la main à la boucle d'événements (phase « check ») : les requêtes
 *  HTTP de l'API passent entre deux CV (incident 05/10/2026). */
function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

/**
 * Incident 05/10/2026 — ce que le RAPPORT garde d'un fichier : son résumé,
 * jamais ses octets ni son texte. Le rapport vit en mémoire jusqu'à la fin du
 * job (puis dans Redis) : un champ lourd glissé dans une issue ferait croître
 * la mémoire avec le nombre de CV.
 */
const HEAVY_OUTCOME_KEYS = new Set(['text', 'fileB64', 'bytes', 'buffer', 'cvText'])
function compactOutcome(outcome: CvBatchFileOutcome): CvBatchFileOutcome {
  const kept: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(outcome)) {
    if (HEAVY_OUTCOME_KEYS.has(key) || Buffer.isBuffer(value) || value instanceof Uint8Array) continue
    kept[key] = value
  }
  return kept as CvBatchFileOutcome
}

/**
 * Ce qu'une entrée d'archive rend au traitement, quelle que soit sa source —
 * `unzipper.Open.custom` en production, une liste posée à la main dans les
 * tests. Cette frontière est ce qui rend {@link processCvZipEntries} testable
 * SANS réseau ni ZIP réel (même discipline que `StorageClient`/`StorageService`).
 */
export type ZipStreamEntry = {
  path: string
  /** `'File' | 'Directory'` — `unzipper` ne type pas plus précisément. */
  type: string
  lastModifiedDateTime: Date | null
  buffer(): Promise<Buffer>
  /** Les octets décompressés EN FLUX (#3481) — absent des doublures de test. */
  stream?(): Readable
}

/**
 * Ce qu'ouvrir un ZIP IMBRIQUÉ rend au dépaquetage récursif — la même forme
 * que les entrées de l'archive extérieure (`ZipStreamEntry`), pour que
 * {@link flattenZipEntries} s'appelle elle-même sans distinguer le premier
 * niveau des suivants. En production : `unzipper.Open.buffer`, sur les
 * octets déjà lus de l'entrée `.zip` — un doublure posée à la main dans les
 * tests, même discipline que {@link ZipStreamEntry.buffer}.
 */
export type OpenNestedZip = (entry: ZipStreamEntry) => Promise<readonly ZipStreamEntry[]>

/**
 * #3303 — DÉPAQUETAGE RÉCURSIF des ZIP imbriqués (le cas réel qui a ouvert
 * l'issue : une archive WeTransfer de 688 entrées contenant « Candidats.zip »
 * et « All 13.8.zip »), profondeur `CV_ZIP_NESTED_MAX_DEPTH` maximum — jamais
 * une boucle sans fin sur une archive pathologique (un ZIP qui se contient
 * lui-même, par exemple).
 *
 * EN FLUX, comme l'archive extérieure : une entrée `.zip` n'est ouverte
 * QUE quand on l'atteint, un fichier à la fois — jamais toutes les archives
 * imbriquées chargées par avance. Ses propres octets (`entry.buffer()`)
 * tiennent forcément en mémoire le temps de la dépaqueter (même contrainte
 * que n'importe quel fichier CV déjà traité un par un), mais jamais plus
 * d'une archive imbriquée à la fois.
 *
 * Le chemin de chaque entrée imbriquée est PRÉFIXÉ par celui de l'archive qui
 * la contient (`Candidats.zip/cv-jean.pdf`) : deux archives imbriquées qui
 * portent chacune un `cv.pdf` restent deux chemins distincts dans le rapport,
 * jamais confondus.
 *
 * Au-delà de la profondeur maximale, l'entrée `.zip` est rendue TELLE
 * QUELLE : `processCvZipEntries` la classera `ignored` (extension hors
 * périmètre), jamais silencieusement perdue.
 */
export async function flattenZipEntries(
  entries: readonly ZipStreamEntry[],
  openNestedZip: OpenNestedZip,
  depth = 1,
  maxDepth: number = CV_ZIP_NESTED_MAX_DEPTH,
): Promise<readonly ZipStreamEntry[]> {
  const flat: ZipStreamEntry[] = []
  for (const entry of entries) {
    const isNested = entry.type === 'File' && isCvZipNestedArchiveEntry(entry.path) && !isCvZipNoiseEntry(entry.path)
    if (isNested && depth <= maxDepth) {
      const nested = await openNestedZip(entry)
      const prefixed = nested.map(inner => ({ ...inner, path: `${entry.path}/${inner.path}` }))
      flat.push(...(await flattenZipEntries(prefixed, openNestedZip, depth + 1, maxDepth)))
    } else {
      flat.push(entry)
    }
  }
  return flat
}

/**
 * LA BOUCLE — un fichier à la fois, jamais l'archive entière en mémoire. Même
 * décision que l'import en ligne (`CvBatchImportService.importZip`) : chaque
 * entrée traverse `CvIntakeService.intakeAutomatic`, qui seul tranche entre
 * créer, auto-valider ou isoler pour revue (#2569.2/#2569.3) — ce fichier ne
 * réimplémente rien de ce pipeline, il ne fait que le NOURRIR depuis une
 * source en streaming.
 *
 * Un fichier illisible n'arrête pas le lot (même règle que `cvBatch.ts` côté
 * navigateur et `importZip` côté serveur) : son échec est nommé, les autres
 * continuent.
 *
 * #3303 — deux règles de plus, partagées avec `CvBatchImportService` :
 *  - Louis 06/10/2026 : plus aucun plafond en nombre d'entrées — toutes sont
 *    traitées (l'ancien plafond de 2 000 avait laissé 329 CV
 *    d'une archive de 2 329 de côté) ;
 *  - un même fichier (empreinte SHA-256 des octets, pas le nom — une copie
 *    renommée reste le même document) présent deux fois dans l'archive n'est
 *    traité QU'UNE fois ; la seconde occurrence est nommée « doublon », jamais
 *    fusionnée ni recréée.
 */
export async function processCvZipEntries(
  workspaceId: string,
  userId: string,
  entries: readonly ZipStreamEntry[],
  cvIntake: CvIntakeService,
  onProgress: (progress: CvZipImportJobProgress) => Promise<void>,
  options: { concurrency?: number; batch?: CvIntakeAutomaticBatch } = {},
): Promise<CvBatchImportReport> {
  const concurrency = Math.max(1, options.concurrency ?? CV_ZIP_ENTRY_CONCURRENCY)
  const files = entries.filter(entry => entry.type === 'File' && !isCvZipNoiseEntry(entry.path))
  const accepted = files
  const total = files.length
  // Indexé par position : le rapport garde l'ordre de l'archive, quel que soit
  // l'ordre dans lequel les lectures parallèles finissent.
  const outcomes: CvBatchFileOutcome[] = new Array<CvBatchFileOutcome>(accepted.length)
  const seenFingerprints = new Set<string>()
  let processed = 0
  let next = 0

  const processOne = async (entry: ZipStreamEntry): Promise<CvBatchFileOutcome> => {
    let bytes: Buffer
    try {
      bytes = await entry.buffer()
    } catch (error) {
      // Import 688 CV (04/10/2026) — une entrée corrompue n'arrête plus le lot.
      const reason = `Fichier illisible dans l’archive : ${(error as Error).message}`
      return { status: 'failed', file: entry.path, reason, category: classifyCvExtractFailure(reason), steps: [] }
    }
    const fingerprint = createHash('sha256').update(bytes).digest('hex')
    if (seenFingerprints.has(fingerprint)) {
      return {
        status: 'ignored',
        file: entry.path,
        reason: 'Doublon dans cette archive (même fichier déjà traité) — pas compté comme une erreur.',
        steps: [],
      }
    }
    seenFingerprints.add(fingerprint)
    const input = { filename: entry.path, fileB64: bytes.toString('base64'), capturedAt: entry.lastModifiedDateTime }
    try {
      return await (options.batch
        ? cvIntake.intakeAutomatic(workspaceId, userId, input, options.batch)
        : cvIntake.intakeAutomatic(workspaceId, userId, input))
    } catch (error) {
      // Import 2 329 CV (05/10/2026) — une écriture refusée par la base sur UN
      // fichier faisait tomber le job entier, deux fois au même 40ᵉ fichier.
      // Son échec est nommé dans le rapport ; les autres continuent.
      const reason = `Ce fichier n’a pas pu être enregistré : ${(error as Error).message}`
      return { status: 'failed', file: entry.path, reason, category: classifyCvExtractFailure(reason), steps: [] }
    }
  }

  // Concurrence bornée (`CV_ZIP_ENTRY_CONCURRENCY`, 1 par défaut depuis
  // l'incident du 05/10/2026). Entre deux fichiers, chaque voie REND LA MAIN
  // à la boucle : le job tourne dans le processus de l'API.
  const lane = async (): Promise<void> => {
    while (next < accepted.length) {
      const index = next
      next += 1
      outcomes[index] = compactOutcome(await processOne(accepted[index]!))
      processed += 1
      await onProgress({ processed, total })
      await yieldToEventLoop()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, accepted.length) }, () => lane()))

  return { total: outcomes.length, summary: summariseCvBatchImport(outcomes), outcomes }
}

/**
 * L'implémentation RÉELLE de {@link OpenNestedZip} (#3481) — l'entrée `.zip`
 * imbriquée est ÉCRITE EN FLUX dans un fichier temporaire, puis ouverte depuis
 * le disque (`unzipper.Open.file`) : la mémoire ne croît jamais avec la taille
 * de l'archive imbriquée (avant, `entry.buffer()` la chargeait en entier — un
 * « Candidats.zip » de plusieurs centaines de Mo faisait tomber le worker).
 * Les fichiers temporaires vivent le temps du lot : l'appelant les efface via
 * `cleanup()` dans son `finally`.
 */
export function createNestedZipOpener(): { open: OpenNestedZip; cleanup: () => Promise<void> } {
  const dirs: string[] = []
  const open: OpenNestedZip = async entry => {
    const dir = await mkdtemp(join(tmpdir(), 'bellum-cv-zip-'))
    dirs.push(dir)
    const target = join(dir, `${randomUUID()}.zip`)
    if (entry.stream) await pipeline(entry.stream(), createWriteStream(target))
    else await pipeline(Readable.from(await entry.buffer()), createWriteStream(target))
    const directory = await Open.file(target)
    return directory.files.map(file => ({
      path: file.path,
      type: file.type,
      lastModifiedDateTime: file.lastModifiedDateTime ?? null,
      buffer: () => file.buffer(),
      stream: () => file.stream(),
    }))
  }
  const cleanup = async (): Promise<void> => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }).catch(() => undefined)))
  }
  return { open, cleanup }
}

/** Ce dont le job a besoin du stockage — deux gestes, rien de plus. */
type CvZipImportStorage = Pick<StorageClient, 'signedUrl' | 'remove'>

/** Le téléchargement — `fetch` en production, une doublure qui COMPTE ses
 *  lectures dans les tests (aucun `Range`, une seule lecture). */
type ArchiveFetch = (url: string, init?: RequestInit) => Promise<Response>

type CvZipImportDeps = {
  storage: CvZipImportStorage
  cvIntake: CvIntakeService
  fetchArchive?: ArchiveFetch
  /** Où poser le fichier temporaire — le `tmpdir()` du système par défaut. */
  tmpRoot?: string
  logger?: Pick<Logger, 'warn'>
}

/**
 * Incident 05/10/2026 — l'archive est téléchargée UNE fois, EN FLUX, vers un
 * fichier temporaire : `pipeline(corps HTTP → fichier)`, jamais un octet de
 * plus que le tampon du flux en mémoire. La progression (octets reçus / total
 * annoncé) est publiée par paliers.
 */
async function downloadArchiveToFile(
  url: string,
  target: string,
  fetchArchive: ArchiveFetch,
  onBytes: (downloaded: number, total: number | null) => Promise<void>,
): Promise<void> {
  const response = await fetchArchive(url)
  if (!response.ok || !response.body) {
    throw new ServiceUnavailableException(`L’archive déposée est illisible depuis le stockage (${response.status}).`)
  }
  const announced = Number(response.headers.get('content-length'))
  const total = Number.isFinite(announced) && announced > 0 ? announced : null
  let downloaded = 0
  let reported = 0
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      downloaded += chunk.length
      if (downloaded - reported < DOWNLOAD_PROGRESS_STEP_BYTES) return callback(null, chunk)
      reported = downloaded
      onBytes(downloaded, total).then(
        () => callback(null, chunk),
        () => callback(null, chunk),
      )
    },
  })
  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    counter,
    createWriteStream(target),
  )
  await onBytes(downloaded, total)
}

function toZipStreamEntries(directory: Awaited<ReturnType<typeof Open.file>>): ZipStreamEntry[] {
  return directory.files.map(file => ({
    path: file.path,
    type: file.type,
    lastModifiedDateTime: file.lastModifiedDateTime ?? null,
    buffer: () => file.buffer(),
    stream: () => file.stream(),
  }))
}

/**
 * Exécute un import ZIP volumineux mis en file par
 * `CvZipLargeImportService.start` — le point 2b de #3065 : l'archive n'a
 * JAMAIS transité par l'API, elle a été déposée directement dans le stockage
 * (URL signée d'upload).
 *
 * ⚠️ INCIDENT 05/10/2026 (boucle de l'API affamée 23 min, 0 fichier traité) —
 * avant, l'archive s'ouvrait par `unzipper.Open.custom` sur des requêtes
 * HTTP `Range`. Or `unzipper` appelle `source.stream(offset)` SANS longueur :
 * l'en-tête partait en `bytes=<offset>-NaN`, invalide, donc IGNORÉ par le
 * stockage, qui renvoyait l'archive ENTIÈRE (200) à chaque lecture — et la
 * recherche de la fin de répertoire la concaténait en mémoire, morceau par
 * morceau (`Buffer.concat`, quadratique, synchrone). Banc : archive de
 * 250 Mo → 60 s sans sortir de l'ouverture, lag p99 1 860 ms, rss 10,8 Go.
 *
 * Désormais, et pour de bon :
 *  1. UN téléchargement, en flux, vers un fichier temporaire (progression
 *     `phase: 'download'`) ;
 *  2. l'archive s'ouvre EN LOCAL (`Open.file`, `phase: 'open'`) ;
 *  3. un fichier à la fois, en flux (`phase: 'entries'`).
 * Plus jamais de `Range` HTTP. Le fichier temporaire est effacé dans le
 * `finally`, succès ou échec ; l'objet déposé aussi (fichier de TRAVAIL).
 */
export async function runCvZipImportJob(
  job: Pick<Job<CvZipImportJobData>, 'data' | 'updateProgress'>,
  deps: CvZipImportDeps,
): Promise<CvBatchImportReport> {
  const { workspaceId, userId, path } = job.data
  const fetchArchive: ArchiveFetch = deps.fetchArchive ?? ((url, init) => fetch(url, init))
  const nested = createNestedZipOpener()
  let workDir: string | null = null

  try {
    await job.updateProgress({ processed: 0, total: null, phase: 'download', bytesDownloaded: 0, bytesTotal: null })
    const readUrl = await deps.storage.signedUrl(path, READ_URL_TTL_SECONDS)
    workDir = await mkdtemp(join(deps.tmpRoot ?? tmpdir(), 'bellum-cv-zip-archive-'))
    const archivePath = join(workDir, 'archive.zip')
    let bytesTotal: number | null = null
    await downloadArchiveToFile(readUrl, archivePath, fetchArchive, async (downloaded, total) => {
      bytesTotal = total
      await job.updateProgress({
        processed: 0,
        total: null,
        phase: 'download',
        bytesDownloaded: downloaded,
        bytesTotal,
      })
    })

    await job.updateProgress({ processed: 0, total: null, phase: 'open', bytesTotal })
    const entries = toZipStreamEntries(await Open.file(archivePath))
    const flatEntries = await flattenZipEntries(entries, nested.open)
    // Le vivier est lu et indexé UNE fois pour tout le lot (point e) — avant,
    // chaque CV relisait jusqu'à 5 000 fiches.
    const batch = await deps.cvIntake.openAutomaticBatch?.(workspaceId)

    return await processCvZipEntries(
      workspaceId,
      userId,
      flatEntries,
      deps.cvIntake,
      progress => job.updateProgress({ ...progress, phase: 'entries' }),
      batch ? { batch } : {},
    )
  } finally {
    await nested.cleanup()
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
    // Best-effort : un effacement manqué laisse un fichier de travail de
    // plus dans le seau, jamais un import qui échoue pour cette seule raison.
    await deps.storage.remove([path]).catch(error => {
      deps.logger?.warn(`Nettoyage de l’archive volumineuse en échec (${path}) : ${(error as Error).message}`)
    })
  }
}

/** Le worker BullMQ — une archive à la fois par processus ; tout le travail
 *  vit dans {@link runCvZipImportJob}. */
@Processor(CV_ZIP_IMPORT_QUEUE, WORKER_OPTIONS)
@Injectable()
export class CvZipImportWorker extends WorkerHost {
  private readonly logger = new Logger(CvZipImportWorker.name)

  constructor(
    private readonly cvIntake: CvIntakeService,
    private readonly storage: StorageClient,
  ) {
    super()
  }

  @Correlated('worker:cv-zip-import')
  async process(job: Job<CvZipImportJobData>): Promise<CvBatchImportReport> {
    return runCvZipImportJob(job, { storage: this.storage, cvIntake: this.cvIntake, logger: this.logger })
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<CvZipImportJobData> | undefined, err: Error): void {
    this.logger.error('Import ZIP volumineux en échec', {
      jobId: job?.id,
      workspaceId: job?.data.workspaceId,
      message: err.message,
    })
  }
}
