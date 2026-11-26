import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import { BadRequestException, Injectable, Logger, NotFoundException, PayloadTooLargeException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { Queue } from 'bullmq'
import {
  buildCvBatchImportJobState,
  buildCvZipManifest,
  CV_ZIP_MAX_ARCHIVE_BYTES,
  classifyCvExtractFailure,
  isCvZipNoiseEntry,
  summariseCvBatchImport,
  type CvBatchFileOutcome,
  type CvBatchImportJobKind,
  type CvBatchImportJobState,
  type CvBatchImportReport,
  type CvFilesImportInput,
  type CvZipManifest,
} from '@bellum/contracts'
import { CvIntakeService } from './cv-intake.service'
import { MailboxService } from '../mailbox/mailbox.service'
import { CvBatchImportJobEntity } from '../../database/entities/cv-batch-import-job.entity'
import {
  CV_BATCH_IMPORT_JOB_OPTIONS,
  CV_BATCH_IMPORT_QUEUE,
  type CvBatchImportEntry,
  type CvBatchImportJobData,
} from './cv-batch-import.queue'

/**
 * L'import de CV EN LOT (#2568.1 pièce jointe, #2569.1 archive ZIP).
 *
 * Aucune seconde route d'ingestion : ce service ne fait que RÉUNIR les octets
 * (dépaquetage ZIP, ou téléchargement d'une pièce jointe) et les faire
 * traverser `CvIntakeService.intakeAutomatic`, qui porte SEUL la logique de
 * dépôt, de déduplication et d'auto-validation (#2569.2, #2569.3).
 */
@Injectable()
export class CvBatchImportService {
  private readonly logger = new Logger(CvBatchImportService.name)

  constructor(
    private readonly cvIntake: CvIntakeService,
    private readonly mailbox: MailboxService,
    @InjectRepository(CvBatchImportJobEntity)
    private readonly jobs: Repository<CvBatchImportJobEntity>,
    @InjectQueue(CV_BATCH_IMPORT_QUEUE)
    private readonly queue: Queue<CvBatchImportJobData>,
  ) {}

  /**
   * #2569.1 — une archive ZIP entière. Chaque entrée traverse le pipeline
   * automatique ; un fichier illisible n'arrête pas le lot (règle 1 de
   * `cvBatch.ts`, appliquée côté serveur cette fois).
   *
   * `entry.header.time` porte la date RÉELLE du fichier dans l'archive — c'est
   * elle qui alimente #2569.2 (« la donnée la plus récente gagne »), jamais la
   * date du dépôt.
   */
  /**
   * Les répertoires et les fichiers techniques du système (métadonnées macOS,
   * `.DS_Store`) ne sont pas des CV — les compter comme des échecs ferait
   * croire à un lot bruité qu'il ne l'est pas. Partagé par `importZip` et
   * `previewZip` : le manifeste doit voir EXACTEMENT ce que l'import traitera.
   */
  private readZipEntries(fileB64: string): AdmZip.IZipEntry[] {
    const bytes = Buffer.from(fileB64, 'base64')
    // #3065 — le transport (`main.ts`) admet un cran au-dessus de cette borne
    // pour que le refus vienne d'ICI, avec sa raison, plutôt que d'un 413 muet
    // du parseur HTTP. Le navigateur porte la MÊME borne (`CvZipImportDialog`)
    // et refuse déjà avant l'envoi — atteindre ce point suppose de l'avoir
    // contournée.
    if (bytes.byteLength > CV_ZIP_MAX_ARCHIVE_BYTES) {
      const maxMb = Math.round(CV_ZIP_MAX_ARCHIVE_BYTES / (1024 * 1024))
      const gotMb = Math.round(bytes.byteLength / (1024 * 1024))
      throw new PayloadTooLargeException(
        `Cette archive fait ${gotMb} Mo ; la limite est de ${maxMb} Mo — découpe-la en plusieurs envois plus petits.`,
      )
    }
    let zip: AdmZip
    try {
      zip = new AdmZip(bytes)
    } catch (error) {
      this.logger.warn(`ZIP CV import: archive illisible (${(error as Error).message})`)
      throw new BadRequestException('Archive ZIP illisible ou corrompue.')
    }
    return zip
      .getEntries()
      .filter(entry => !entry.isDirectory)
      .filter(entry => !isCvZipNoiseEntry(entry.entryName))
  }

  /**
   * #2431.6 (épopée #2883) — le MANIFESTE : nombre de fichiers et doublons
   * INTERNES au lot, lus AVANT tout traitement, sans écrire une seule fiche
   * ni appeler `CvIntakeService`. Coût et durée n'y figurent pas — voir
   * l'en-tête de `buildCvZipManifest` (@bellum/contracts) pour la raison.
   */
  async previewZip(fileB64: string): Promise<CvZipManifest> {
    const entries = this.readZipEntries(fileB64)
    return buildCvZipManifest(
      entries.map(entry => ({
        name: entry.entryName,
        sha256: createHash('sha256').update(entry.getData()).digest('hex'),
      })),
    )
  }

  async importZip(workspaceId: string, userId: string, fileB64: string): Promise<CvBatchImportReport> {
    // Louis 06/10/2026 : plus aucun plafond en nombre — toutes les entrées sont traitées.
    const accepted = this.readZipEntries(fileB64)

    const outcomes: CvBatchFileOutcome[] = []
    // Incident boucle API (05/10/2026) — le vivier lu et indexé UNE fois pour
    // tout le lot (comme le job volumineux), plus de rapprochement O(n × vivier).
    const batch = accepted.length > 0 ? await this.cvIntake.openAutomaticBatch(workspaceId) : undefined
    for (const entry of accepted) {
      const outcome = await this.cvIntake.intakeAutomatic(
        workspaceId,
        userId,
        {
          filename: entry.entryName,
          fileB64: entry.getData().toString('base64'),
          capturedAt: entry.header.time ?? null,
        },
        batch,
      )
      outcomes.push(outcome)
    }
    return { total: outcomes.length, summary: summariseCvBatchImport(outcomes), outcomes }
  }

  /**
   * #2326.6 (épopée #2794) — le manifeste d'un DOSSIER entier, même discipline
   * que {@link previewZip} : compte les fichiers et leurs doublons INTERNES
   * (par empreinte, jamais par nom), sans écrire une seule fiche.
   */
  async previewFiles(files: CvFilesImportInput['files']): Promise<CvZipManifest> {
    return buildCvZipManifest(
      files.map(file => ({
        name: file.filename,
        sha256: createHash('sha256').update(Buffer.from(file.fileB64, 'base64')).digest('hex'),
      })),
    )
  }

  /**
   * #2326.6 (épopée #2794) — un DOSSIER entier de CV (`webkitdirectory`), hors
   * d'une archive ZIP. Même pipeline automatique que {@link importZip}
   * (`CvIntakeService.intakeAutomatic` SEUL porte la décision) — ce qui
   * change ici est la SOURCE des octets : des fichiers déjà séparés, pas des
   * entrées à dépaqueter, donc pas de date de dernière modification fiable à
   * transmettre (contrairement à `entry.header.time` d'une archive ZIP) :
   * `capturedAt` reste `null`, comme pour une pièce jointe sans date connue.
   */
  async importFiles(
    workspaceId: string,
    userId: string,
    files: CvFilesImportInput['files'],
  ): Promise<CvBatchImportReport> {
    // Louis 06/10/2026 : plus aucun plafond en nombre — tous les fichiers sont traités.
    const accepted = files

    const outcomes: CvBatchFileOutcome[] = []
    for (const file of accepted) {
      const outcome = await this.cvIntake.intakeAutomatic(workspaceId, userId, {
        filename: file.filename,
        fileB64: file.fileB64,
        capturedAt: null,
      })
      outcomes.push(outcome)
    }
    return { total: outcomes.length, summary: summariseCvBatchImport(outcomes), outcomes }
  }

  /**
   * #2326.12 (épopée #2794) — L'ORCHESTRATEUR ASYNCHRONE : dépose un job sur
   * la file `cv-batch-import` et rend la main IMMÉDIATEMENT, au lieu de
   * boucler dans la requête HTTP (ce que `importZip`/`importFiles` ci-dessus
   * font toujours, inchangés — aucun appelant existant ne casse).
   *
   * Louis 06/10/2026 : plus aucun plafond en nombre de fichiers — un lot de
   * 2 329 CV part en UN job, rien n'est refusé ni tronqué.
   */
  private async enqueueEntries(
    workspaceId: string,
    userId: string,
    kind: CvBatchImportJobKind,
    entries: CvBatchImportEntry[],
  ): Promise<{ jobId: string; total: number }> {
    const total = entries.length
    const row = await this.jobs.save(
      this.jobs.create({
        workspace_id: workspaceId,
        user_id: userId,
        kind,
        status: 'queued',
        total,
        processed_count: 0,
        outcomes: [],
      }),
    )
    const jobData: CvBatchImportJobData = { jobId: row.id, workspaceId, userId, kind, entries }
    await this.queue.add('import', jobData, { ...CV_BATCH_IMPORT_JOB_OPTIONS, jobId: row.id })
    return { jobId: row.id, total }
  }

  /** #2569.1, en tâche de fond — mêmes octets que {@link importZip}, un job en plus. */
  async enqueueZip(workspaceId: string, userId: string, fileB64: string): Promise<{ jobId: string; total: number }> {
    const entries = this.readZipEntries(fileB64)
    const batchEntries: CvBatchImportEntry[] = entries.map(entry => ({
      filename: entry.entryName,
      fileB64: entry.getData().toString('base64'),
      capturedAtMs: entry.header.time ? entry.header.time.getTime() : null,
    }))
    return this.enqueueEntries(workspaceId, userId, 'zip', batchEntries)
  }

  /** #2326.6, en tâche de fond — mêmes octets que {@link importFiles}, un job en plus. */
  async enqueueFiles(
    workspaceId: string,
    userId: string,
    files: CvFilesImportInput['files'],
  ): Promise<{ jobId: string; total: number }> {
    const batchEntries: CvBatchImportEntry[] = files.map(file => ({
      filename: file.filename,
      fileB64: file.fileB64,
      capturedAtMs: null,
    }))
    return this.enqueueEntries(workspaceId, userId, 'files', batchEntries)
  }

  /**
   * L'état d'un job — ce que l'écran interroge pendant et après l'envoi, y
   * compris après un rechargement de page (#2326.27, la reprise après
   * déconnexion) : rien ici ne dépend de la connexion HTTP qui a lancé le job.
   */
  async getJobState(workspaceId: string, jobId: string): Promise<CvBatchImportJobState> {
    const row = await this.jobs.findOne({ where: { id: jobId, workspace_id: workspaceId } })
    if (!row) throw new NotFoundException("Job d'import introuvable.")
    return buildCvBatchImportJobState(row)
  }

  /**
   * #1952.4 (épopée #2844) — ce que le pont Laura (`laura/import-overview`)
   * relaie pour que la conversation puisse dire où en est un import de CV en
   * lot déjà lancé depuis l'écran. Ne LANCE toujours rien (la conversation ne
   * transporte aucun fichier) — une LECTURE, scopée par espace comme
   * `getJobState`, la plus récente d'abord (index `workspace_id, created_at`
   * de l'entité).
   */
  async listRecentJobs(workspaceId: string, limit: number): Promise<CvBatchImportJobState[]> {
    const rows = await this.jobs.find({
      where: { workspace_id: workspaceId },
      order: { created_at: 'DESC' },
      take: limit,
    })
    return rows.map(buildCvBatchImportJobState)
  }

  /**
   * #2568.1 — une pièce jointe d'un fil AUTORISÉ devient une fiche du vivier.
   *
   * Ne lit JAMAIS le corps du message (D65) : seule la pièce jointe traverse
   * ce chemin, via `MailboxService.getAttachment`, qui relit un identifiant
   * déjà donné par `listAttachments` — rien n'est deviné.
   */
  async importFromMailAttachment(
    workspaceId: string,
    userId: string,
    messageId: string,
    attachmentId: string,
  ): Promise<CvBatchFileOutcome> {
    const attachment = await this.mailbox.getAttachment(userId, messageId, attachmentId)
    if (!attachment) {
      const reason = 'Pièce jointe introuvable — le message a peut-être changé depuis.'
      return { status: 'failed', file: attachmentId, reason, category: classifyCvExtractFailure(reason), steps: [] }
    }
    const capturedAt = attachment.messageDate ? new Date(attachment.messageDate) : null
    return this.cvIntake.intakeAutomatic(workspaceId, userId, {
      filename: attachment.filename,
      fileB64: attachment.dataB64,
      capturedAt: Number.isNaN(capturedAt?.getTime()) ? null : capturedAt,
    })
  }
}
