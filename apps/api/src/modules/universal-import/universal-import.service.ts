import { findNameHolder } from '../contacts/contact-name-collision'
import { randomUUID } from 'node:crypto'
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import type { Queue } from 'bullmq'
import {
  DataSource,
  IsNull,
  MoreThanOrEqual,
  Repository,
  type EntityManager,
  type EntityTarget,
  type ObjectLiteral,
} from 'typeorm'
import {
  UNIVERSAL_IMPORT_CHUNK_ROWS,
  UNIVERSAL_IMPORT_PART_BYTES,
  UNIVERSAL_IMPORT_VERIFY_ROW_CAP,
  emptyUniversalImportFamilyCounts,
  normaliseCompanyName,
  proposeUniversalMapping,
  detectUniversalImportType,
  orderUniversalSheetPlans,
  type UniversalImportType,
  UNIVERSAL_IMPORT_UPLOAD_STALE_MS,
  universalImportHeadersRecognised,
  universalImportFieldKeys,
  universalImportFamilyOfIssue,
  universalImportFormatOf,
  universalImportIssuesToCsv,
  universalImportSourceOf,
  universalMappingError,
  sensitiveHeaders,
  type UniversalImportBreakdown,
  type UniversalImportCreateInput,
  type UniversalImportIssue,
  type UniversalImportReasonCount,
  type PersonalContact,
  type UniversalImportJobState,
  type UniversalImportMapping,
  type UniversalImportPreview,
  type UniversalImportRowVerdict,
  type UniversalImportScope,
  type UniversalImportSheetPass,
  type UniversalImportSheetPlan,
  type UniversalImportVerification,
  type UniversalImportVerifiedRow,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { PersonalContactEntity } from '../../database/entities/personal-contact.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { SyncLinkEntity } from '../../database/entities/sync-link.entity'
import {
  UniversalImportIssueEntity,
  UniversalImportJobEntity,
} from '../../database/entities/universal-import-job.entity'
import { StorageClient } from '../storage/storage.client'
import { readUniversalRecords, type UniversalReadOptions, type UniversalSheetInfo } from './universal-import-parser'
import { importMarkGroups } from './universal-import-marks'
import { insertImportMarks } from '../crm-core/record-import-marks'
import {
  accountKeysFor,
  contactKeysFor,
  needKeyFor,
  talentKeysFor,
  planUniversalChunk,
  type UniversalChunkPlan,
  type UniversalPlanContext,
  type UniversalValidatedRow,
} from './universal-import-planner'
import {
  UNIVERSAL_IMPORT_JOB_OPTIONS,
  UNIVERSAL_IMPORT_QUEUE,
  type UniversalImportJobData,
} from './universal-import.queue'

/** Ce que l'écran d'« Organiser l'arrivée » ajoute au lancement (Théo B c4) — tout est facultatif. */
type UniversalStartOptions = {
  skipLines?: readonly number[]
  /** #5223 — plusieurs feuilles d'un classeur, chacune avec SA correspondance de colonnes. */
  sheets?: readonly UniversalImportSheetPlan[]
  scope?: UniversalImportScope
  sourceSystem?: string | null
}

/** Ce qu'un paquet a fait avancer — ce que la passerelle temps réel pousse à l'écran. */
type ProgressSink = (state: UniversalImportJobState) => void

/**
 * L'IMPORT UNIVERSEL — le transport (parts, stockage, file) et l'application
 * d'un paquet. La DÉCISION (valider, dédoublonner) vit dans le planificateur
 * pur ; ici on écrit ce qu'il a décidé, dans une transaction par paquet.
 *
 * ⚠️ PORTÉE : chaque lecture de job passe par `{ id, workspace_id }` — jamais
 * `where: { id }` seul. Un identifiant de job est de l'obscurité, pas un droit.
 *
 * ⚠️ JOURNAUX : aucune cellule, aucun nom, aucune adresse n'y entre — seulement
 * des identifiants de job et des compteurs.
 */
@Injectable()
export class UniversalImportService {
  private readonly logger = new Logger(UniversalImportService.name)

  constructor(
    @InjectRepository(UniversalImportJobEntity) private readonly jobs: Repository<UniversalImportJobEntity>,
    @InjectRepository(UniversalImportIssueEntity) private readonly issues: Repository<UniversalImportIssueEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(PersonalContactEntity) private readonly personalContacts: Repository<PersonalContactEntity>,
    @InjectRepository(ProjectNeedEntity) private readonly needs: Repository<ProjectNeedEntity>,
    @InjectRepository(ConsultantEntity) private readonly talents: Repository<ConsultantEntity>,
    @InjectRepository(SyncLinkEntity) private readonly syncLinks: Repository<SyncLinkEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storage: StorageClient,
    @Optional() @InjectQueue(UNIVERSAL_IMPORT_QUEUE) private readonly queue?: Queue<UniversalImportJobData>,
  ) {}

  /* ------------------------------------------------------------------ */
  /*  Gestes HTTP                                                        */
  /* ------------------------------------------------------------------ */

  async create(
    workspaceId: string,
    userId: string,
    input: UniversalImportCreateInput,
  ): Promise<UniversalImportJobState> {
    const format = universalImportFormatOf(input.filename)
    if (!format) {
      throw new BadRequestException('Format non reconnu : dépose un fichier CSV, TSV, XLSX ou JSON.')
    }
    const row = await this.jobs.save(
      this.jobs.create({
        workspace_id: workspaceId,
        user_id: userId,
        type: input.type,
        format,
        filename: input.filename,
        account_id: input.accountId ?? null,
        scope: input.scope ?? 'workspace',
        source_system: input.sourceSystem ?? null,
        status: 'uploading',
        parts_expected: input.parts,
      }),
    )
    return toState(row)
  }

  /**
   * Une part. SÉQUENTIELLE et idempotente : renvoyer la part N déjà reçue la
   * réécrit (même chemin) ; sauter une part est refusé — un fichier à trou
   * produirait des lignes coupées en deux.
   */
  async putPart(workspaceId: string, jobId: string, index: number, dataB64: string): Promise<UniversalImportJobState> {
    const job = await this.find(workspaceId, jobId)
    if (job.status !== 'uploading') throw new ConflictException('Cet import est déjà lancé.')
    if (!Number.isInteger(index) || index < 0 || index >= job.parts_expected) {
      throw new BadRequestException('Numéro de part hors du fichier annoncé.')
    }
    if (index > job.parts_received)
      throw new ConflictException(`Part ${index} reçue avant la part ${job.parts_received}.`)
    const bytes = Buffer.from(dataB64, 'base64')
    if (bytes.byteLength === 0 || bytes.byteLength > UNIVERSAL_IMPORT_PART_BYTES) {
      throw new BadRequestException('Part vide ou plus grande que la taille de part convenue.')
    }
    await this.storage.put(partPath(workspaceId, jobId, index), bytes, 'application/octet-stream')
    if (index === job.parts_received) {
      await this.jobs.update({ id: jobId, workspace_id: workspaceId }, { parts_received: index + 1 })
      job.parts_received = index + 1
    }
    return toState(job)
  }

  /**
   * #3666.9 (Louis 15/10/2026, incident du 05/10) — l'upload DIRECT d'une part : l'API signe une porte
   * d'écriture vers le chemin de CETTE part (bâti ici, jamais choisi par le client), et ne voit jamais
   * l'octet. Mêmes règles que {@link putPart} : séquentielle, dans le fichier annoncé, import non lancé.
   */
  async signPart(
    workspaceId: string,
    jobId: string,
    index: number,
  ): Promise<{ uploadUrl: string; path: string; token: string }> {
    const job = await this.find(workspaceId, jobId)
    this.assertPartIndex(job, index)
    return this.storage.createSignedUploadUrl(partPath(workspaceId, jobId, index))
  }

  /** #3666.9 — la part déposée est-elle là, et de la taille convenue ? Lue dans le stockage, jamais téléchargée. */
  async confirmPart(workspaceId: string, jobId: string, index: number): Promise<UniversalImportJobState> {
    const job = await this.find(workspaceId, jobId)
    this.assertPartIndex(job, index)
    const size = await this.storage.objectSize(partPath(workspaceId, jobId, index))
    if (size === null) throw new BadRequestException(`Part ${index} introuvable dans le stockage — renvoie-la.`)
    if (size === 0 || size > UNIVERSAL_IMPORT_PART_BYTES) {
      throw new BadRequestException('Part vide ou plus grande que la taille de part convenue.')
    }
    if (index === job.parts_received) {
      await this.jobs.update({ id: jobId, workspace_id: workspaceId }, { parts_received: index + 1 })
      job.parts_received = index + 1
    }
    return toState(job)
  }

  private assertPartIndex(job: { status: string; parts_expected: number; parts_received: number }, index: number) {
    if (job.status !== 'uploading') throw new ConflictException('Cet import est déjà lancé.')
    if (!Number.isInteger(index) || index < 0 || index >= job.parts_expected) {
      throw new BadRequestException('Numéro de part hors du fichier annoncé.')
    }
    if (index > job.parts_received)
      throw new ConflictException(`Part ${index} reçue avant la part ${job.parts_received}.`)
  }

  /** En-têtes, proposition de mapping et quelques lignes — lus en flux, on s'arrête tôt. */
  async preview(workspaceId: string, jobId: string, sheet?: string | null): Promise<UniversalImportPreview> {
    const job = await this.find(workspaceId, jobId)
    this.assertComplete(job)
    let headers: string[] = []
    const sample: Record<string, string>[] = []
    let sheets: UniversalSheetInfo[] | undefined
    let selected: string | null = null
    for await (const event of readUniversalRecords(this.partsOf(job), job.format, this.readOptions(job, sheet))) {
      if (event.kind === 'sheets') {
        sheets = event.sheets
        selected = event.selected || null
      } else if (event.kind === 'headers') headers = event.headers
      else sample.push(event.record)
      if (sample.length >= 5) break
    }
    return {
      headers,
      mapping: proposeUniversalMapping(headers, job.type),
      sample,
      fields: universalImportFieldKeys(job.type),
      // #4426.4 — hors classeur, ni onglets ni onglet retenu.
      ...(sheets ? { sheets: sheets.map(detectedSheet), sheet: selected } : {}),
    }
  }

  /** #4426.4 — l'onglet voulu (choisi par l'humain, sinon celui du job) et ce qui reconnaît le bon tableau. */
  private readOptions(job: UniversalImportJobEntity, sheet?: string | null): UniversalReadOptions {
    return {
      sheet: sheet ?? job.sheet ?? null,
      recognises: headers => universalImportHeadersRecognised(headers, job.type),
    }
  }

  /** Le mapping VALIDÉ par l'humain, puis la file. La requête rend la main tout de suite. */
  async start(
    workspaceId: string,
    jobId: string,
    mapping: UniversalImportMapping,
    sheet?: string | null,
    options: UniversalStartOptions = {},
  ): Promise<UniversalImportJobState> {
    const job = await this.find(workspaceId, jobId)
    if (job.status !== 'uploading') throw new ConflictException('Cet import est déjà lancé.')
    this.assertComplete(job)
    const plans = this.sheetPlansOf(job, options)
    // #5224 — plusieurs feuilles : chacune est validée contre SON type (sheetPlansOf) ; le mapping du dépôt n'est que le premier.
    const error = plans ? null : universalMappingError(mapping, job.type)
    if (error) throw new BadRequestException(error)
    const passes = plans ? plans.map(newSheetPass) : null
    const arrival = this.arrivalOf(job, options)
    // Conditionnelle : deux « Lancer » simultanés ne mettent en file qu'UN job.
    const claimed = await this.jobs.update(
      { id: jobId, workspace_id: workspaceId, status: 'uploading' },
      {
        // #5223 — plusieurs feuilles : chacune porte son mapping ; celui du job n'est que la première.
        mapping: plans ? (plans[0]?.mapping ?? mapping) : mapping,
        ...(plans?.[0]?.type ? { type: plans[0].type } : {}),
        status: 'queued',
        sheet: plans ? null : (sheet ?? null),
        sheet_passes: passes,
        skipped_lines: [...new Set(options.skipLines ?? [])],
        scope: arrival.scope,
        source_system: arrival.sourceSystem,
      },
    )
    if (claimed.affected === 0) throw new ConflictException('Cet import est déjà lancé.')
    await this.enqueue(job)
    return toState({
      ...job,
      mapping,
      status: 'queued',
      sheet: plans ? null : (sheet ?? null),
      sheet_passes: passes,
      scope: arrival.scope,
      source_system: arrival.sourceSystem,
    })
  }

  /**
   * #5223 — les feuilles d'un dépôt multi-feuilles, validées : un classeur seulement, chaque mapping valide pour le
   * type, et aucune ligne « à ne pas importer » (ses numéros sont ceux d'UNE feuille). `null` = une seule feuille.
   */
  private sheetPlansOf(
    job: UniversalImportJobEntity,
    options: UniversalStartOptions,
  ): ReadonlyArray<UniversalImportSheetPlan & { type: UniversalImportType }> | null {
    const plans = options.sheets
    if (!plans?.length) return null
    if (job.format !== 'xlsx') throw new BadRequestException('Seul un classeur a plusieurs feuilles.')
    if (options.skipLines?.length) {
      throw new BadRequestException('Les lignes à écarter se disent pour UNE feuille, pas pour plusieurs.')
    }
    // #5224 — le type de chaque feuille est celui que l'humain a gardé ou corrigé, sinon celui du dépôt ; et les
    // comptes s'écrivent AVANT les contacts, quel que soit l'ordre du classeur.
    const typed = plans.map(plan => ({ ...plan, type: plan.type ?? job.type }))
    for (const plan of typed) {
      const error = universalMappingError(plan.mapping, plan.type)
      if (error) throw new BadRequestException(`Feuille « ${plan.name} » : ${error}`)
    }
    if ((options.scope ?? job.scope) === 'personal' && typed.some(plan => plan.type !== 'contact')) {
      throw new BadRequestException('La portée personnelle n’existe que pour les contacts.')
    }
    return orderUniversalSheetPlans(typed)
  }

  /** La portée (équipe / moi seul, contacts seulement) et le CRM d'origine : ceux dits à l'écran, sinon ceux du job. */
  private arrivalOf(
    job: UniversalImportJobEntity,
    options: UniversalStartOptions,
  ): { scope: UniversalImportScope; sourceSystem: string | null } {
    const scope = options.scope ?? job.scope
    if (scope === 'personal' && job.type !== 'contact') {
      throw new BadRequestException('La portée personnelle n’existe que pour les contacts.')
    }
    return {
      scope,
      sourceSystem: options.sourceSystem === undefined ? job.source_system : options.sourceSystem?.trim() || null,
    }
  }

  /**
   * Théo B c4-assistant-import.R3 — LA VÉRIFICATION, avant tout import et QUELLE QUE SOIT LA TAILLE du fichier :
   * le plan que le worker suivrait, lu ligne à ligne, SANS rien écrire (le planificateur est pur ; ni transaction,
   * ni file, ni fiche). Le détail est borné, les compteurs couvrent tout le fichier. L'import en arrière-plan ne part
   * qu'APRÈS cette vérification — c'est l'écran qui ne propose « Importer » qu'avec son rapport en main.
   */
  async verify(
    workspaceId: string,
    jobId: string,
    mapping: UniversalImportMapping,
    sheet?: string | null,
    options: { rowCap?: number } & UniversalStartOptions = {},
  ): Promise<UniversalImportVerification> {
    const found = await this.find(workspaceId, jobId)
    if (found.status !== 'uploading') throw new ConflictException('Cet import est déjà lancé.')
    this.assertComplete(found)
    // La portée et le CRM d'origine se disent APRÈS le dépôt : la vérification les lit sur une COPIE, rien n'est écrit.
    const arrival = this.arrivalOf(found, options)
    const job = Object.assign(Object.create(Object.getPrototypeOf(found)) as UniversalImportJobEntity, found, {
      scope: arrival.scope,
      source_system: arrival.sourceSystem,
    })
    const error = universalMappingError(mapping, job.type)
    if (error) throw new BadRequestException(error)
    const rowCap = options.rowCap ?? UNIVERSAL_IMPORT_VERIFY_ROW_CAP
    const plans = this.sheetPlansOf(job, options)
    if (!plans) {
      const single = await this.verifyPass(job, mapping, sheet, rowCap)
      return {
        ...single.tally,
        rows: single.rows.sort((a, b) => a.line - b.line),
        truncated: single.truncated,
        sensitiveColumns: sensitiveHeaders(single.headers),
        // Un fichier de contacts n'apporte aucune base légale : chaque création arriverait sans (RGPD, à ne pas perdre).
        withoutLegalBasis: job.type === 'contact' ? single.tally.toCreate : 0,
      }
    }
    // #5223 — une passe par feuille, un seul plan : les compteurs s'additionnent, le détail ligne à ligne ne se mêle
    // pas (le numéro de ligne n'est unique que DANS sa feuille).
    const total = { total: 0, toCreate: 0, toComplete: 0, discarded: 0 }
    const sheets: NonNullable<UniversalImportVerification['sheets']> = []
    const sensitive = new Set<string>()
    let contactsToCreate = 0
    for (const plan of plans) {
      const pass = await this.verifyPass(job, plan.mapping, plan.name, 0, plan.type)
      sheets.push({ name: plan.name, ...pass.tally })
      if (plan.type === 'contact') contactsToCreate += pass.tally.toCreate
      for (const key of Object.keys(total) as Array<keyof typeof total>) total[key] += pass.tally[key]
      for (const header of sensitiveHeaders(pass.headers)) sensitive.add(header)
    }
    return {
      ...total,
      rows: [],
      truncated: total.total > 0,
      sensitiveColumns: [...sensitive],
      withoutLegalBasis: contactsToCreate,
      sheets,
    }
  }

  /** Le plan d'UNE lecture (une feuille, ou le fichier), lu SANS rien écrire. */
  private async verifyPass(
    job: UniversalImportJobEntity,
    mapping: UniversalImportMapping,
    sheet: string | null | undefined,
    rowCap: number,
    type: UniversalImportType = job.type,
  ): Promise<{
    tally: { total: number; toCreate: number; toComplete: number; discarded: number }
    rows: UniversalImportVerifiedRow[]
    truncated: boolean
    headers: string[]
  }> {
    const context = await this.loadContext(job, mapping, type)
    const labelOf = new Map<number, string | null>()
    const tally = { total: 0, toCreate: 0, toComplete: 0, discarded: 0 }
    const rows: UniversalImportVerifiedRow[] = []
    let truncated = false
    let headers: string[] = []
    let chunk: UniversalValidatedRow[] = []

    const settle = (): void => {
      if (chunk.length === 0) return
      const plan = planUniversalChunk(context, chunk)
      const verdicts = new Map<number, UniversalImportVerifiedRow>()
      for (const create of plan.creates) {
        verdicts.set(create.line, {
          line: create.line,
          verdict: 'create',
          label: create.label,
          reason: null,
          existingId: null,
        })
      }
      for (const fill of plan.fills) {
        verdicts.set(fill.line, {
          line: fill.line,
          verdict: 'complete',
          label: labelOf.get(fill.line) ?? null,
          reason: null,
          existingId: fill.id,
        })
      }
      for (const issue of plan.issues) {
        const verdict: UniversalImportRowVerdict =
          issue.kind === 'rejected' ? 'invalid' : issue.kind === 'duplicate' ? 'duplicate' : 'to_reconcile'
        verdicts.set(issue.row, {
          line: issue.row,
          verdict,
          label: issue.label,
          reason: issue.reason,
          existingId: issue.existingId,
        })
      }
      for (const { line } of chunk) {
        const found = verdicts.get(line) ?? {
          line,
          verdict: 'invalid' as const,
          label: null,
          reason: null,
          existingId: null,
        }
        tally.total += 1
        if (found.verdict === 'create') tally.toCreate += 1
        else if (found.verdict === 'complete') tally.toComplete += 1
        else tally.discarded += 1
        if (rows.length < rowCap) rows.push(found)
        else truncated = true
      }
      chunk = []
    }

    for await (const event of readUniversalRecords(this.partsOf(job), job.format, this.readOptions(job, sheet))) {
      if (event.kind === 'headers') headers = event.headers
      if (event.kind !== 'row') continue
      chunk.push({ line: event.line, record: event.record })
      if (chunk.length >= UNIVERSAL_IMPORT_CHUNK_ROWS) settle()
    }
    settle()

    return { tally, rows, truncated, headers }
  }

  /**
   * Reprendre un job `failed` — au dernier paquet VALIDÉ (`committed_rows`),
   * jamais depuis zéro. Un timeout n'est pas un échec définitif.
   */
  async resume(workspaceId: string, jobId: string): Promise<UniversalImportJobState> {
    const job = await this.find(workspaceId, jobId)
    if (job.status !== 'failed') throw new ConflictException('Seul un import interrompu se reprend.')
    const claimed = await this.jobs.update(
      { id: jobId, workspace_id: workspaceId, status: 'failed' },
      { status: 'queued', error: null },
    )
    if (claimed.affected === 0) throw new ConflictException('Cet import a déjà été relancé.')
    await this.enqueue(job)
    return toState({ ...job, status: 'queued', error: null })
  }

  async state(workspaceId: string, jobId: string): Promise<UniversalImportJobState> {
    return toState(await this.find(workspaceId, jobId))
  }

  /**
   * #4051.10 — L'HISTORIQUE des imports : date, fichier, volumes, statut, bilan par famille. Les imports d'ÉQUIPE
   * de l'espace, plus les PERSONNELS de CET utilisateur seulement (un import personnel ne se lit que par son auteur,
   * comme `allPersonalContacts`). Les plus récents d'abord, bornés : un historique n'est pas un export.
   */
  async history(workspaceId: string, userId: string, limit = HISTORY_LIMIT): Promise<UniversalImportHistoryItem[]> {
    const rows = await this.jobs.find({
      where: { workspace_id: workspaceId },
      order: { created_at: 'DESC' },
      take: limit * 2,
    })
    const visible = rows
      .filter(row => (row.scope ?? 'workspace') === 'workspace' || row.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit)
    const reasons = await this.reasonsOf(
      workspaceId,
      visible.map(row => row.id),
    )
    const linked = await this.linkedCountsOf(
      workspaceId,
      visible.map(row => row.id),
    )
    const now = Date.now()
    return visible.map(row => ({
      ...toState(row),
      createdAt: new Date(row.created_at).toISOString(),
      reasons: reasons.get(row.id) ?? [],
      // #4597.3 — une absence ne fait aucune clé : un import d'avant la colonne n'a pas de lien « voir ».
      ...(linked.has(row.id) ? { linked: linked.get(row.id) } : {}),
      // #4422.1 — un envoi resté « en cours d'envoi » au-delà du délai est interrompu : dit à la lecture, jamais supprimé.
      interrupted:
        row.status === 'uploading' && now - new Date(row.created_at).getTime() > UNIVERSAL_IMPORT_UPLOAD_STALE_MS,
    }))
  }

  /**
   * MEYER-IMPORT M.2 (#4051) — pour chaque import, les écartés et les « à rapprocher » COMPTÉS PAR RAISON (une
   * requête groupée, jamais les lignes). Un import sans rejet n'a aucune entrée : une absence ne fait pas de ligne.
   */
  private async reasonsOf(workspaceId: string, jobIds: string[]): Promise<Map<string, UniversalImportReasonCount[]>> {
    const byJob = new Map<string, UniversalImportReasonCount[]>()
    if (jobIds.length === 0) return byJob
    const grouped: Array<{ job_id: string; kind: string; reason: string; count: number | string }> =
      await this.issues.query(
        `SELECT job_id, kind, reason, COUNT(*)::int AS count FROM universal_import_issues
         WHERE workspace_id = $1 AND job_id = ANY($2::uuid[]) AND kind IN ('rejected', 'to_reconcile')
         GROUP BY job_id, kind, reason ORDER BY COUNT(*) DESC, reason ASC`,
        [workspaceId, jobIds],
      )
    for (const row of grouped) {
      const list = byJob.get(row.job_id) ?? []
      list.push({ kind: row.kind as UniversalImportReasonCount['kind'], reason: row.reason, count: Number(row.count) })
      byJob.set(row.job_id, list)
    }
    return byJob
  }

  /**
   * #4597.3 — pour chaque import, combien de contacts / comptes portent SON identifiant (une requête groupée par
   * table, bornée à l'espace). Un import sans fiche marquée n'a aucune entrée : jamais « 0 ». Illisible ⇒ aucune
   * entrée, donc aucun lien (le lien « voir » ne se devine pas).
   */
  private async linkedCountsOf(
    workspaceId: string,
    jobIds: string[],
  ): Promise<Map<string, { contacts?: number; accounts?: number }>> {
    const byJob = new Map<string, { contacts?: number; accounts?: number }>()
    if (jobIds.length === 0) return byJob
    for (const [key, repo] of [
      ['contacts', this.contacts],
      ['accounts', this.accounts],
    ] as const) {
      try {
        const rows: Array<{ job_id: string; count: number | string }> = await (
          repo as Repository<ContactEntity | AccountEntity>
        )
          .createQueryBuilder('r')
          .select('r.import_job_id', 'job_id')
          .addSelect('COUNT(*)::int', 'count')
          .where('r.workspace_id = :workspaceId', { workspaceId })
          .andWhere('r.import_job_id IN (:...jobIds)', { jobIds })
          .groupBy('r.import_job_id')
          .getRawMany()
        for (const row of rows) {
          const count = Number(row.count)
          if (!Number.isInteger(count) || count <= 0) continue
          byJob.set(row.job_id, { ...byJob.get(row.job_id), [key]: count })
        }
      } catch (error) {
        this.logger.error('Compte des fiches par import illisible', { error, tags: { table: key } })
      }
    }
    return byJob
  }

  /** Le rapport téléchargeable : doublons proposés + lignes rejetées, relus par pages. */
  /**
   * #2927 — les contacts PERSONNELS de CET utilisateur sur un compte. Le propriétaire est dans la clause, jamais
   * un paramètre de l'appelant : il n'existe aucune lecture « des contacts personnels de quelqu'un d'autre ».
   */
  async listPersonalContacts(workspaceId: string, userId: string, accountId?: string): Promise<PersonalContact[]> {
    // Sans `accountId` : TOUS ceux de l'utilisateur (écran /contacts, #2927 recette Z1 04/10) — le propriétaire reste dans la clause.
    const rows = await this.personalContacts.find({
      where: {
        workspace_id: workspaceId,
        user_id: userId,
        ...(accountId ? { account_id: accountId } : {}),
        promoted_at: IsNull(),
      },
      order: { created_at: 'DESC', full_name: 'ASC' },
      take: 500,
    })
    return rows.map(row => ({
      id: row.id,
      accountId: row.account_id,
      fullName: row.full_name,
      title: row.title ?? null,
      email: row.email ?? null,
      phone: row.phone ?? null,
      linkedinUrl: row.linkedin_url ?? null,
      createdAt: row.created_at.toISOString(),
    }))
  }

  /**
   * #2927 (#2159.70) — « PARTAGER AVEC L'ÉQUIPE » : geste explicite du propriétaire, seul chemin par lequel un contact
   * personnel entre dans `contacts` (et donc alimente comptes, organigramme, séquences). La ligne personnelle est
   * ARCHIVÉE (`promoted_at`), jamais supprimée. Un e-mail déjà connu de l'équipe sur ce compte ne crée pas de doublon :
   * la fiche existante est rendue (`alreadyKnown`). Le propriétaire est dans la clause — jamais un paramètre d'appelant.
   */
  async promotePersonalContact(
    workspaceId: string,
    userId: string,
    personalContactId: string,
  ): Promise<{ contactId: string; alreadyKnown: boolean }> {
    const row = await this.personalContacts.findOne({
      where: { id: personalContactId, workspace_id: workspaceId, user_id: userId, promoted_at: IsNull() },
    })
    if (!row) throw new NotFoundException('Contact personnel introuvable.')
    const email = row.email?.trim().toLowerCase() || null
    const known = email
      ? await this.contacts.findOne({ where: { workspace_id: workspaceId, account_id: row.account_id, email } })
      : null
    // #4479 — le nom normalisé est unique par compte : une fiche de même nom est la fiche connue.
    const sameName =
      !known && row.account_id ? await findNameHolder(this.contacts, row.account_id, row.full_name) : null
    let contactId = known?.id ?? sameName?.id
    if (!contactId) {
      const created = await this.contacts.save(
        this.contacts.create({
          workspace_id: workspaceId,
          user_id: userId,
          account_id: row.account_id,
          full_name: row.full_name,
          title: row.title,
          email,
          phone: row.phone,
          linkedin_url: row.linkedin_url,
          tags: row.tags,
          family: row.family,
          priority: row.priority,
          source: row.source ?? 'import',
          lifecycle_state: row.lifecycle_state,
          extra: row.extra,
        } as Partial<ContactEntity>),
      )
      contactId = created.id
    }
    await this.personalContacts.update(
      { id: row.id, user_id: userId },
      { promoted_at: new Date(), promoted_contact_id: contactId },
    )
    return { contactId, alreadyKnown: !!known || !!sameName }
  }

  /**
   * #AM.9 (#4053) — « Valider les sociétés » d'un clic : celles que le bilan PROPOSAIT (`company_to_validate`,
   * sans fiche voisine) deviennent des comptes, sans refaire l'import avec un fichier comptes. Un nom déjà
   * présent dans l'espace ne se recrée pas (rejouer le clic ne double rien) ; un homonyme probable ou une
   * référence inconnue reste PROPOSÉ — on ne fusionne jamais. Les contacts en attente se rattachent en
   * rejouant leur fichier : les sociétés sont alors reconnues par leur nom.
   */
  async validateCompanies(
    workspaceId: string,
    userId: string,
    jobId: string,
  ): Promise<{ created: number; alreadyThere: number }> {
    const job = await this.find(workspaceId, jobId)
    if (job.scope === 'personal')
      throw new ConflictException('Un import personnel ne crée aucun compte : rien à valider.')
    const proposed = await this.issues.find({
      where: { workspace_id: workspaceId, job_id: jobId, kind: 'to_reconcile', reason: 'company_to_validate' },
    })
    const labels = new Map<string, string>()
    for (const issue of proposed) {
      const label = issue.label?.trim()
      if (!label || issue.existing_id) continue
      const key = normaliseCompanyName(label)
      if (key && !labels.has(key)) labels.set(key, label)
    }
    const known = new Set(
      (await this.accounts.find({ where: { workspace_id: workspaceId }, select: ['id', 'company_name'] })).map(
        account => normaliseCompanyName(account.company_name),
      ),
    )
    const toCreate = [...labels].filter(([key]) => !known.has(key))
    if (toCreate.length > 0) {
      await this.accounts.insert(
        toCreate.map(([, label]) => ({
          id: randomUUID(),
          workspace_id: workspaceId,
          user_id: userId,
          company_name: label,
          tags: [],
          status: 'imported' as const,
          assigned_to: userId,
          extra: {},
        })),
      )
    }
    return { created: toCreate.length, alreadyThere: labels.size - toCreate.length }
  }

  async reportCsv(workspaceId: string, jobId: string): Promise<string> {
    await this.find(workspaceId, jobId)
    const all: UniversalImportIssue[] = []
    let from = 0
    for (;;) {
      const page = await this.issues.find({
        where: { workspace_id: workspaceId, job_id: jobId, row_number: MoreThanOrEqual(from) },
        order: { row_number: 'ASC', id: 'ASC' },
        take: 5_000,
      })
      if (page.length === 0) break
      for (const issue of page) {
        all.push({
          row: issue.row_number,
          kind: issue.kind,
          reason: issue.reason,
          existingId: issue.existing_id,
          label: issue.label,
        })
      }
      if (page.length < 5_000) break
      from = (page[page.length - 1]?.row_number ?? from) + 1
    }
    return universalImportIssuesToCsv(all)
  }

  /* ------------------------------------------------------------------ */
  /*  Le travail du worker                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Lit le fichier EN FLUX, saute les lignes des paquets déjà validés, écrit
   * chaque paquet dans UNE transaction avec son point de reprise. Rend `false`
   * si le job a disparu (espace purgé) — ce n'est pas une panne à retenter.
   */
  async process(workspaceId: string, jobId: string, onProgress: ProgressSink = () => undefined): Promise<boolean> {
    const job = await this.jobs.findOne({ where: { id: jobId, workspace_id: workspaceId } })
    if (!job || !job.mapping) return false
    if (job.status === 'done') return true
    await this.jobs.update({ id: jobId, workspace_id: workspaceId }, { status: 'processing' })
    job.status = 'processing'
    // #5223 — un dépôt multi-feuilles : une passe par feuille, chacune avec SON mapping et SON point de reprise.
    if (job.sheet_passes?.length) return this.processSheets(job, onProgress)

    const context = await this.loadContext(job, job.mapping)
    const skip = job.committed_rows
    // Théo B c4.N1 — les lignes que l'humain a écartées à la vérification : listées au rapport, jamais écrites.
    const declined = new Set(job.skipped_lines ?? [])
    let seen = 0
    let chunk: UniversalValidatedRow[] = []
    let declinedInChunk: UniversalImportIssue[] = []
    const flush = async (): Promise<void> => {
      const plan = planUniversalChunk(context, chunk)
      plan.issues.push(...declinedInChunk)
      await this.commitChunk(job, plan, chunk.length + declinedInChunk.length)
      chunk = []
      declinedInChunk = []
    }

    for await (const event of readUniversalRecords(this.partsOf(job), job.format, this.readOptions(job))) {
      if (event.kind !== 'row') continue
      seen += 1
      if (seen <= skip) continue
      if (declined.has(event.line)) {
        declinedInChunk.push({
          row: event.line,
          kind: 'rejected',
          reason: 'skipped_by_user',
          existingId: null,
          label: null,
        })
      } else {
        chunk.push({ line: event.line, record: event.record })
      }
      if (chunk.length + declinedInChunk.length >= UNIVERSAL_IMPORT_CHUNK_ROWS) {
        await flush()
        onProgress(toState(job))
      }
    }
    if (chunk.length + declinedInChunk.length > 0) await flush()
    return this.finish(job, seen, onProgress)
  }

  /**
   * #5223 — UNE passe par feuille, dans l'ordre du lancement. Une feuille `done` n'est PAS relue ; une feuille
   * entamée reprend à son dernier paquet validé (`committedRows`, écrit dans la transaction du paquet). Une feuille
   * absente du classeur lève : le lecteur choisirait une autre feuille « au jugé », ce que la doctrine interdit.
   */
  private async processSheets(job: UniversalImportJobEntity, onProgress: ProgressSink): Promise<boolean> {
    for (const pass of job.sheet_passes ?? []) {
      if (pass.done) continue
      // #5224 — la feuille s'écrit COMME le type qu'elle porte (celui du dépôt pour un dépôt d'avant).
      const type = pass.type ?? job.type
      const context = await this.loadContext(job, pass.mapping, type)
      let seen = 0
      let chunk: UniversalValidatedRow[] = []
      const flush = async (): Promise<void> => {
        await this.commitChunk(job, planUniversalChunk(context, chunk), chunk.length, pass.name, type)
        chunk = []
      }
      const options = { ...this.readOptions(job), sheet: pass.name }
      for await (const event of readUniversalRecords(this.partsOf(job), job.format, options)) {
        if (event.kind === 'sheets' && !event.sheets.some(found => found.name === pass.name)) {
          throw new Error(`Feuille introuvable dans le classeur : « ${pass.name} »`)
        }
        if (event.kind !== 'row') continue
        seen += 1
        if (seen <= pass.committedRows) continue
        chunk.push({ line: event.line, record: event.record })
        if (chunk.length >= UNIVERSAL_IMPORT_CHUNK_ROWS) {
          await flush()
          onProgress(toState(job))
        }
      }
      if (chunk.length > 0) await flush()
      const passes = (job.sheet_passes ?? []).map(each =>
        each.name === pass.name ? { ...each, done: true, totalRows: seen } : each,
      )
      await this.jobs.update({ id: job.id, workspace_id: job.workspace_id }, { sheet_passes: passes })
      job.sheet_passes = passes
      onProgress(toState(job))
    }
    const total = (job.sheet_passes ?? []).reduce((sum, pass) => sum + (pass.totalRows ?? 0), 0)
    return this.finish(job, total, onProgress)
  }

  /** Le job est lu jusqu'au bout : `done`, les parts effacées, le journal posé. */
  private async finish(job: UniversalImportJobEntity, seen: number, onProgress: ProgressSink): Promise<boolean> {
    const jobId = job.id
    const workspaceId = job.workspace_id
    await this.jobs.update({ id: jobId, workspace_id: workspaceId }, { status: 'done', total_rows: seen, error: null })
    Object.assign(job, { status: 'done', total_rows: seen, error: null })
    onProgress(toState(job))
    // Le fichier a servi : ses parts (des données personnelles, souvent) ne
    // restent pas au stockage. Seul un job TERMINÉ les efface — un job
    // interrompu en a besoin pour reprendre. Échec d'effacement journalisé
    // par le client de stockage, jamais bloquant pour le rapport.
    await this.storage.remove(
      Array.from({ length: job.parts_expected }, (_, index) => partPath(job.workspace_id, job.id, index)),
    )
    this.logger.log(
      `Import universel terminé (${jobId}) : ${job.imported_count} créées, ${job.duplicate_count} doublons proposés, ${job.rejected_count} rejetées`,
    )
    return true
  }

  /** Toutes les tentatives épuisées : `failed`, REPRENABLE. Le message ne porte aucune cellule. */
  async markFailed(workspaceId: string, jobId: string, reason: string): Promise<void> {
    await this.jobs.update({ id: jobId, workspace_id: workspaceId }, { status: 'failed', error: reason })
  }

  /**
   * UN paquet, UNE transaction : créations + lignes du rapport + point de
   * reprise. Un crash au milieu annule TOUT le paquet — la reprise le rejoue en
   * entier, jamais à moitié. Si la base refuse l'insertion groupée (contrainte),
   * le paquet est rejoué ligne à ligne sous SAVEPOINT : la ligne fautive part
   * au rapport (`write_failed`), les autres passent.
   */
  private async commitChunk(
    job: UniversalImportJobEntity,
    plan: UniversalChunkPlan,
    rowCount: number,
    sheet: string | null = null,
    type: UniversalImportType = job.type,
  ): Promise<void> {
    const issues = [...plan.issues]
    await this.dataSource.transaction(async manager => {
      // #4053.1 — les comptes créés depuis un fichier contacts s'écrivent AVANT les contacts qui les citent.
      const accountsWritten = await this.insertCreates(manager, AccountEntity, plan.accountCreates, issues)
      // Le planificateur rend des valeurs de colonne à plat ; la cible est tranchée par le type du job.
      // #2927 — un import PERSONNEL écrit dans `personal_contacts`, jamais dans `contacts`.
      const target = job.scope === 'personal' && type === 'contact' ? PersonalContactEntity : INSERT_TARGET[type]
      if (!target && plan.creates.length > 0) throw new Error(`Type sans écrivain : ${type}`)
      const written = target ? await this.insertCreates(manager, target, plan.creates, issues) : writtenIds()
      // #4052.3 — une fiche reconnue par sa référence se COMPLÈTE : `COALESCE`, jamais une valeur réécrite.
      // Sous SAVEPOINT : une valeur que la base refuse (contrainte) part au rapport, le paquet continue.
      const filled: Array<{ id: string; target: 'account' | 'contact' }> = []
      for (const fill of plan.fills) {
        await manager.query('SAVEPOINT universal_import_fill')
        try {
          await fillEmptyColumns(manager, job.workspace_id, fill)
          filled.push({ id: fill.id, target: fill.target })
        } catch (error) {
          if (!isConstraintError(error)) throw error
          await manager.query('ROLLBACK TO SAVEPOINT universal_import_fill')
          issues.push({ row: fill.line, kind: 'rejected', reason: 'write_failed', existingId: fill.id, label: null })
        }
      }
      // #4051 — « Importé le <date> depuis <fichier> » : une trace par fiche écrite ou complétée, sous le NOM du
      // fichier déposé. Sous SAVEPOINT : une trace manquée ne fait jamais échouer le paquet.
      for (const group of importMarkGroups({
        jobType: type,
        scope: job.scope,
        written,
        accountsWritten,
        filled,
      })) {
        await manager.query('SAVEPOINT universal_import_mark')
        try {
          await insertImportMarks(manager, {
            workspaceId: job.workspace_id,
            entityType: group.entityType,
            entityIds: group.ids,
            sourceKind: 'file',
            sourceLabel: job.filename,
          })
        } catch (error) {
          await manager.query('ROLLBACK TO SAVEPOINT universal_import_mark')
          this.logger.warn(`Trace d'import non écrite (${group.entityType}): ${(error as Error).message}`)
        }
      }
      // #4052.2 — les références s'écrivent dans `sync_links` (une seule notion par espace), seulement pour
      // une fiche réellement écrite ; un lien déjà posé n'est jamais réattribué (`orIgnore`).
      const source = universalImportSourceOf(job.source_system)
      const links = plan.links.filter(
        link => !(accountsWritten.pending.has(link.internalId) || written.pending.has(link.internalId)),
      )
      if (links.length > 0) {
        await manager
          .createQueryBuilder()
          .insert()
          .into(SyncLinkEntity)
          .values(
            links.map(link => ({
              workspace_id: job.workspace_id,
              provider: source.provider,
              entity_type: link.entityType,
              external_id: link.externalId,
              internal_id: link.internalId,
            })),
          )
          .orIgnore()
          .execute()
      }
      if (issues.length > 0) {
        await manager.getRepository(UniversalImportIssueEntity).insert(
          issues.map(issue => ({
            workspace_id: job.workspace_id,
            job_id: job.id,
            row_number: issue.row,
            kind: issue.kind,
            reason: issue.reason,
            existing_id: issue.existingId,
            label: issue.label,
            sheet,
          })),
        )
      }
      const count = (kind: string) => issues.filter(issue => issue.kind === kind).length
      const patch = {
        committed_rows: job.committed_rows + rowCount,
        imported_count: job.imported_count + written.size,
        duplicate_count: job.duplicate_count + count('duplicate'),
        rejected_count: job.rejected_count + count('rejected'),
        to_reconcile_count: (job.to_reconcile_count ?? 0) + count('to_reconcile'),
        breakdown: addToBreakdown(job.breakdown ?? {}, type, {
          created: written.size,
          accountsCreated: accountsWritten.size,
          matched: plan.matched,
          alreadyKnown: plan.alreadyKnown,
          resolved: plan.resolved,
          issues,
        }),
        // #5223 — la passe de la feuille avance DANS la même transaction que ses écritures : son point de reprise
        // ne dit jamais plus (ni moins) que ce qui est écrit.
        ...(sheet
          ? {
              sheet_passes: (job.sheet_passes ?? []).map(pass =>
                pass.name === sheet ? advancePass(pass, rowCount, written.size, issues) : pass,
              ),
            }
          : {}),
      }
      await manager
        .getRepository(UniversalImportJobEntity)
        .update({ id: job.id, workspace_id: job.workspace_id }, patch)
      Object.assign(job, patch)
    })
  }

  /**
   * Écrit des créations en lot ; si la base refuse le lot (contrainte), rejoue ligne à ligne sous SAVEPOINT :
   * la ligne fautive part au rapport (`write_failed`). Rend les identifiants ÉCRITS, et ceux refusés
   * (`pending`) — un lien de référence ne se pose jamais sur une fiche qui n'existe pas.
   */
  private async insertCreates(
    manager: EntityManager,
    target: EntityTarget<ObjectLiteral>,
    creates: UniversalChunkPlan['creates'],
    issues: UniversalImportIssue[],
  ): Promise<WrittenIds> {
    const written = writtenIds()
    if (creates.length === 0) return written
    const insert = (values: Record<string, unknown>[]) =>
      manager.createQueryBuilder().insert().into(target).values(values).execute()
    await manager.query('SAVEPOINT universal_import_batch')
    try {
      await insert(creates.map(create => create.values))
      for (const create of creates) written.add(create.id)
      return written
    } catch (error) {
      if (!isConstraintError(error)) throw error
      await manager.query('ROLLBACK TO SAVEPOINT universal_import_batch')
    }
    for (const create of creates) {
      await manager.query('SAVEPOINT universal_import_row')
      try {
        await insert([create.values])
        written.add(create.id)
      } catch (error) {
        if (!isConstraintError(error)) throw error
        await manager.query('ROLLBACK TO SAVEPOINT universal_import_row')
        written.pending.add(create.id)
        issues.push({
          row: create.line,
          kind: 'rejected',
          reason: 'write_failed',
          existingId: null,
          label: create.label,
        })
      }
    }
    return written
  }

  /** Ce que le planificateur doit savoir de l'espace — chargé UNE fois par passage, scopé à l'espace. */
  private async loadContext(
    job: UniversalImportJobEntity,
    mapping: UniversalImportMapping,
    type: UniversalImportType = job.type,
  ): Promise<UniversalPlanContext> {
    const context: UniversalPlanContext = {
      type,
      workspaceId: job.workspace_id,
      userId: job.user_id,
      importJobId: job.id, // #4597.3
      mapping,
      accountId: job.account_id,
      accountByName: new Map(),
      known: new Map(),
      source: universalImportSourceOf(job.source_system),
      // #4052.2 — un import d'équipe écrit les références ; un import personnel les lit seulement.
      writesRefs: job.scope !== 'personal',
      // #4053.1 — un fichier contacts d'équipe, hors fiche compte, crée les comptes absents par référence.
      canCreateAccounts: type === 'contact' && job.scope !== 'personal' && !job.account_id,
      accountByRef: new Map(),
      refByAccount: new Map(),
      contactByRef: new Map(),
      createdIds: new Set(),
    }
    if (type === 'account' || type === 'contact') {
      // #4052 — les références de CETTE source dans CET espace : jamais celles d'un autre CRM.
      const prefix = context.source.namespace ? `${context.source.namespace}:` : ''
      const links = await this.syncLinks.find({
        where: { workspace_id: job.workspace_id, provider: context.source.provider },
        select: ['entity_type', 'external_id', 'internal_id'],
      })
      for (const link of links) {
        if (prefix && !link.external_id.startsWith(prefix)) continue
        if (link.entity_type === 'account') {
          context.accountByRef.set(link.external_id, link.internal_id)
          context.refByAccount.set(link.internal_id, link.external_id)
        } else if (link.entity_type === 'contact') {
          context.contactByRef.set(link.external_id, link.internal_id)
        }
      }
    }
    if (type === 'account' || ((type === 'contact' || type === 'need') && !job.account_id)) {
      const accounts = await this.accounts.find({
        where: { workspace_id: job.workspace_id },
        select: ['id', 'company_name', 'siren', 'website'],
      })
      for (const account of accounts) {
        context.accountByName.set(normaliseCompanyName(account.company_name), account.id)
        if (type !== 'account') continue
        for (const key of accountKeysFor({
          company: account.company_name,
          siren: account.siren,
          website: account.website,
        })) {
          if (!context.known.has(key)) context.known.set(key, account.id)
        }
      }
    }
    if (type === 'contact') {
      const contacts = await this.contacts.find({
        where: {
          workspace_id: job.workspace_id,
          deleted_at: IsNull(),
          ...(job.account_id ? { account_id: job.account_id } : {}),
        },
        select: ['id', 'account_id', 'full_name', 'title', 'email', 'phone', 'linkedin_url'],
      })
      // #2927 — un import personnel ne doublonne pas non plus ce que son auteur a déjà en privé.
      // LECTURE seule des contacts PERSONNELS de l'auteur du job : jamais ceux d'un autre.
      const personal =
        job.scope === 'personal'
          ? await this.personalContacts.find({
              where: { workspace_id: job.workspace_id, user_id: job.user_id },
              select: ['id', 'account_id', 'full_name', 'email', 'phone', 'linkedin_url'],
            })
          : []
      context.titleById = new Map(contacts.map(contact => [contact.id, contact.title ?? null]))
      for (const contact of [...contacts, ...personal]) {
        // Un contact sans compte ne peut être le doublon d'aucune ligne : chaque ligne en a un.
        if (!contact.account_id) continue
        const keys = contactKeysFor(contact.account_id, {
          fullName: contact.full_name,
          email: contact.email,
          phone: contact.phone,
          linkedinUrl: contact.linkedin_url,
        })
        for (const key of keys) if (!context.known.has(key)) context.known.set(key, contact.id)
      }
    }
    if (type === 'need') {
      const needs = await this.needs.find({
        where: { workspace_id: job.workspace_id, ...(job.account_id ? { account_id: job.account_id } : {}) },
        select: ['id', 'account_id', 'title'],
      })
      for (const need of needs) {
        const key = needKeyFor(need.account_id, need.title)
        if (!context.known.has(key)) context.known.set(key, need.id)
      }
    }
    if (type === 'talent') {
      const talents = await this.talents.find({
        where: { workspace_id: job.workspace_id },
        select: ['id', 'email', 'phone'],
      })
      for (const talent of talents) {
        for (const key of talentKeysFor({ email: talent.email, phone: talent.phone })) {
          if (!context.known.has(key)) context.known.set(key, talent.id)
        }
      }
    }
    return context
  }

  private async *partsOf(job: UniversalImportJobEntity): AsyncGenerator<Buffer> {
    for (let index = 0; index < job.parts_expected; index += 1) {
      yield await this.storage.get(partPath(job.workspace_id, job.id, index))
    }
  }

  private async enqueue(job: UniversalImportJobEntity): Promise<void> {
    if (!this.queue) throw new ConflictException('La file d’import n’est pas disponible.')
    await this.queue.add(
      'universal-import',
      { jobId: job.id, workspaceId: job.workspace_id },
      UNIVERSAL_IMPORT_JOB_OPTIONS,
    )
  }

  private assertComplete(job: UniversalImportJobEntity): void {
    if (job.parts_received < job.parts_expected) {
      throw new ConflictException(
        `Fichier incomplet : ${job.parts_received} part(s) reçue(s) sur ${job.parts_expected}.`,
      )
    }
  }

  private async find(workspaceId: string, jobId: string): Promise<UniversalImportJobEntity> {
    const job = await this.jobs.findOne({ where: { id: jobId, workspace_id: workspaceId } })
    if (!job) throw new NotFoundException('Import introuvable.')
    return job
  }
}

/** Les identifiants écrits par un lot, et ceux que la base a refusés (`pending`). */
type WrittenIds = Set<string> & { pending: Set<string> }
const writtenIds = (): WrittenIds => Object.assign(new Set<string>(), { pending: new Set<string>() })

/** La table qu'un type ÉCRIT alimente. Absent = type déclaré sans écrivain (ses lignes sont rejetées avant). */
const INSERT_TARGET: Partial<Record<UniversalImportJobEntity['type'], EntityTarget<ObjectLiteral>>> = {
  account: AccountEntity,
  contact: ContactEntity,
  need: ProjectNeedEntity,
  talent: ConsultantEntity,
}

/** Le chemin d'une part — sous l'ESPACE, pour que le cloisonnement se lise aussi dans le magasin. */
function partPath(workspaceId: string, jobId: string, index: number): string {
  return `universal-imports/${workspaceId}/${jobId}/part-${String(index).padStart(6, '0')}`
}

/** Une erreur de CONTRAINTE Postgres (classe 23) — la ligne est fautive, pas la base. */
function isConstraintError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && code.startsWith('23')
}

/** #4051.10 — combien d'imports l'historique rend. */
const HISTORY_LIMIT = 20

/** #4051.10 — une ligne d'historique : l'état du job, et QUAND il a été déposé. */
export type UniversalImportHistoryItem = UniversalImportJobState & {
  createdAt: string
  /** M.2 — les écartés et à rapprocher, comptés par raison. */
  reasons: UniversalImportReasonCount[]
  /** #4422.1 — `true` : l'envoi est resté « en cours » au-delà de `UNIVERSAL_IMPORT_UPLOAD_STALE_MS`. */
  interrupted: boolean
  /** #4597.3 — les fiches nées de CET import (contacts / comptes), pour « voir les N ». Absent = pas de lien. */
  linked?: { contacts?: number; accounts?: number }
}

function toState(job: UniversalImportJobEntity): UniversalImportJobState {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    filename: job.filename,
    totalRows: job.total_rows ?? null,
    processedRows: job.committed_rows,
    imported: job.imported_count,
    duplicates: job.duplicate_count,
    rejected: job.rejected_count,
    error: job.error ?? null,
    scope: job.scope ?? 'workspace',
    toReconcile: job.to_reconcile_count ?? 0,
    breakdown: job.breakdown ?? {},
    queryableByLaura: queryableByLauraOf(job),
    sourceSystem: job.source_system ?? null,
    // #5223 — le bilan par feuille ; absent pour une seule feuille, jamais une liste vide.
    ...(job.sheet_passes?.length ? { sheets: job.sheet_passes.map(({ mapping: _mapping, ...report }) => report) } : {}),
  }
}

/** #5224 — l'aperçu d'une feuille : ce que le produit croit y lire, ses colonnes ; rien quand rien n'est reconnu. */
function detectedSheet({
  headers,
  ...sheet
}: UniversalSheetInfo): NonNullable<UniversalImportPreview['sheets']>[number] {
  const found = detectUniversalImportType(headers)
  if (found.type) return { ...sheet, detected: { type: found.type, columns: found.columns } }
  return found.candidates.length > 1 ? { ...sheet, candidates: found.candidates } : sheet
}

/** #5223 — une feuille à lire : rien lu, rien écrit, `totalRows` inconnu (jamais 0). */
function newSheetPass(plan: UniversalImportSheetPlan): UniversalImportSheetPass {
  return {
    name: plan.name,
    ...(plan.type ? { type: plan.type } : {}),
    mapping: plan.mapping,
    done: false,
    totalRows: null,
    committedRows: 0,
    created: 0,
    duplicates: 0,
    rejected: 0,
    toReconcile: 0,
    reasons: [],
  }
}

/** #5223 — le bilan d'une feuille après un paquet : compteurs, et écarts comptés PAR RAISON. */
function advancePass(
  pass: UniversalImportSheetPass,
  rowCount: number,
  created: number,
  issues: readonly UniversalImportIssue[],
): UniversalImportSheetPass {
  const reasons = pass.reasons.map(reason => ({ ...reason }))
  for (const issue of issues) {
    if (issue.kind === 'duplicate') continue
    const found = reasons.find(reason => reason.kind === issue.kind && reason.reason === issue.reason)
    if (found) found.count += 1
    else reasons.push({ kind: issue.kind, reason: issue.reason, count: 1 })
  }
  const count = (kind: string) => issues.filter(issue => issue.kind === kind).length
  return {
    ...pass,
    committedRows: pass.committedRows + rowCount,
    created: pass.created + created,
    duplicates: pass.duplicates + count('duplicate'),
    rejected: pass.rejected + count('rejected'),
    toReconcile: pass.toReconcile + count('to_reconcile'),
    reasons,
  }
}

/**
 * #4051.1 — « interrogeable par Laura » : ce qui est versé dans la base d'ÉQUIPE que ses outils lisent
 * (`contacts` via `ContactsService.findAllForUser`, comptes du portefeuille). Un import personnel n'y entre
 * pas ; besoins et consultants ne sont pas mesurés ici — `null`, jamais un 0 inventé.
 */
function queryableByLauraOf(job: UniversalImportJobEntity): number | null {
  const types = job.sheet_passes?.length ? job.sheet_passes.map(pass => pass.type ?? job.type) : [job.type]
  if (job.scope === 'personal' || types.some(type => type !== 'contact' && type !== 'account')) return null
  const breakdown = job.breakdown ?? {}
  return (['account', 'contact'] as const).reduce(
    (sum, family) => sum + (breakdown[family]?.created ?? 0) + (breakdown[family]?.matched ?? 0),
    0,
  )
}

/** #4051.1 — ajoute un paquet au bilan par famille. Pur. */
function addToBreakdown(
  current: UniversalImportBreakdown,
  jobType: UniversalImportJobEntity['type'],
  chunk: {
    created: number
    accountsCreated: number
    matched: UniversalChunkPlan['matched']
    alreadyKnown: UniversalChunkPlan['alreadyKnown']
    resolved: UniversalChunkPlan['resolved']
    issues: readonly UniversalImportIssue[]
  },
): UniversalImportBreakdown {
  const next: UniversalImportBreakdown = {}
  for (const [family, counts] of Object.entries(current)) {
    next[family as keyof UniversalImportBreakdown] = { ...counts }
  }
  const family = (key: keyof UniversalImportBreakdown) => (next[key] ??= emptyUniversalImportFamilyCounts())
  if (chunk.created > 0) family(jobType).created += chunk.created
  if (chunk.accountsCreated > 0) family('account').created += chunk.accountsCreated
  for (const [key, value] of Object.entries(chunk.matched)) {
    if (value) family(key as keyof UniversalImportBreakdown).matched += value
  }
  for (const [key, value] of Object.entries(chunk.alreadyKnown)) {
    if (value) {
      const counts = family(key as keyof UniversalImportBreakdown)
      counts.alreadyKnown = (counts.alreadyKnown ?? 0) + value
    }
  }
  // #4051.5 — personnes distinctes et comptes résolus, sur la famille du lot ; zéro ne s'écrit pas.
  if (jobType === 'contact' && chunk.resolved.people > 0) {
    const counts = family('contact')
    counts.distinctPeople = (counts.distinctPeople ?? 0) + chunk.resolved.people
  }
  if ((jobType === 'contact' || jobType === 'account') && chunk.resolved.accounts > 0) {
    const counts = family(jobType)
    counts.resolvedAccounts = (counts.resolvedAccounts ?? 0) + chunk.resolved.accounts
  }
  for (const issue of chunk.issues) {
    const counts = family(universalImportFamilyOfIssue(jobType, issue.reason))
    if (issue.kind === 'duplicate') counts.duplicates += 1
    else if (issue.kind === 'rejected') counts.rejected += 1
    else counts.toReconcile += 1
  }
  return next
}

/** #4052.3 — les colonnes qu'une complétion peut REMPLIR, par table. Rien d'autre n'est touché. */
const FILLABLE_COLUMNS = {
  contact: ['title', 'email', 'phone', 'linkedin_url'],
  account: ['siren', 'website', 'sector', 'employees', 'headquarters', 'phone', 'address'],
} as const

/**
 * #4052.3 — complète une fiche reconnue par sa référence : une colonne VIDE reçoit la valeur du fichier, une
 * colonne renseignée garde la sienne (une correction humaine gagne toujours, quelle que soit sa date).
 */
async function fillEmptyColumns(
  manager: EntityManager,
  workspaceId: string,
  fill: UniversalChunkPlan['fills'][number],
): Promise<void> {
  const columns = FILLABLE_COLUMNS[fill.target].filter(column => {
    const value = fill.values[column]
    return typeof value === 'string' && value.trim() !== ''
  })
  // #4426.4 — des ÉTIQUETTES s'ajoutent sans doublon ni retrait (le tier d'un compte importé avant le tiering).
  const tagsAdd = fill.target === 'account' && Array.isArray(fill.values['tags_add']) ? fill.values['tags_add'] : []
  if (columns.length === 0 && tagsAdd.length === 0) return
  const params: unknown[] = [fill.id, workspaceId]
  const sets = columns.map(column => {
    params.push(fill.values[column])
    return `${column} = COALESCE(NULLIF(${column}, ''), $${params.length})`
  })
  if (tagsAdd.length > 0) {
    params.push(tagsAdd)
    sets.push(
      `tags = ARRAY(SELECT DISTINCT t FROM unnest(COALESCE(tags, '{}') || $${params.length}::text[]) AS t ORDER BY t)`,
    )
  }
  const table = fill.target === 'contact' ? 'contacts' : 'accounts'
  const archived = fill.target === 'contact' ? ' AND deleted_at IS NULL' : ''
  await manager.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $1 AND workspace_id = $2${archived}`, params)
}
