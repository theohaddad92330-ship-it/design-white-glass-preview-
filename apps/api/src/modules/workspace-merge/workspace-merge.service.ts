import { InjectQueue } from '@nestjs/bullmq'
import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import type { Queue } from 'bullmq'
import type {
  WorkspaceMergePlanItem,
  WorkspaceMergePreview,
  WorkspaceMergeRequestView,
  WorkspaceMergeStatus,
} from '@bellum/contracts'
import { buildMergePreview, duplicateLookupKeys, mergePreviewHash } from './workspace-merge.plan'
import { WORKSPACE_MERGE_QUEUE, type WorkspaceMergeJobData } from './workspace-merge.queue'
import {
  WORKSPACE_MERGE_STORE,
  type MergeRecordedItem,
  type MergeRequestRecord,
  type WorkspaceMergeStore,
} from './workspace-merge.store'

const ADMIN_ROLES = ['owner', 'admin']
/** Ce que l'admin de la cible suit : la demande à trancher, puis le job. */
const TARGET_VISIBLE: readonly WorkspaceMergeStatus[] = ['awaiting_admin', 'approved', 'running', 'failed']
const REPLACEABLE: readonly WorkspaceMergeStatus[] = ['previewed', 'awaiting_admin']
const RUNNABLE: readonly WorkspaceMergeStatus[] = ['approved', 'running', 'failed']

/**
 * #4158.57 (décision Louis 17/10/2026, arrêt levé sous conditions) — RAPATRIER L'ESPACE PERSONNEL d'un
 * utilisateur dans l'espace ESN qu'il a rejoint.
 *
 *  (a) `preview` calcule l'aperçu SANS RIEN ÉCRIRE et le persiste avec son empreinte ;
 *  (b) `confirm` (l'utilisateur) puis `approve` (un admin de la CIBLE) portent sur CETTE empreinte, revérifiée
 *      contre la donnée vivante — un aperçu périmé ne se valide pas ;
 *  (c) la fin du job ARCHIVE l'espace personnel : rien n'y est supprimé, ses lignes restent lisibles ;
 *  (e) `run` est une SIMULATION par défaut ; l'écriture exige `write: true` ET le hash validé. Le journal
 *      `workspace_merge_items` rend chaque étape idempotente, donc le job reprenable après coupure ;
 *  (f) le store ne lit que la source et la cible, chaque requête bornée par son espace ;
 *  (g) une fiche existante de la cible n'est JAMAIS réécrite : un doublon est proposé, pas fusionné.
 */
@Injectable()
export class WorkspaceMergeService {
  private readonly logger = new Logger(WorkspaceMergeService.name)

  constructor(
    @Inject(WORKSPACE_MERGE_STORE) private readonly store: WorkspaceMergeStore,
    @InjectQueue(WORKSPACE_MERGE_QUEUE) private readonly queue: Pick<Queue<WorkspaceMergeJobData>, 'add'>,
  ) {}

  /** La simulation : l'aperçu de ce qui partirait, persisté avec son empreinte. Aucune donnée écrite. */
  async preview(userId: string, targetWorkspaceId: string): Promise<WorkspaceMergeRequestView> {
    const source = await this.store.personalWorkspaceOf(userId)
    if (!source) throw new NotFoundException('Aucun espace personnel à rapatrier')
    const target = await this.store.workspace(targetWorkspaceId)
    const role = await this.store.roleIn(userId, targetWorkspaceId)
    if (!target || !role || target.isDemo || target.archivedAt || target.id === source.id) {
      throw new ForbiddenException('Cet espace ne peut pas recevoir votre espace personnel')
    }

    const preview = await this.livePreview(source.id, target.id)
    const hash = mergePreviewHash(preview)
    const live = await this.store.liveRequestForSource(source.id)
    if (live && !REPLACEABLE.includes(live.status)) {
      throw new ConflictException('Un rapatriement de cet espace est déjà en cours')
    }
    const patch = {
      workspace_id: target.id,
      status: 'previewed' as const,
      preview,
      preview_hash: hash,
      user_validated_at: null,
      admin_validated_by: null,
      admin_validated_at: null,
    }
    if (live) {
      await this.store.updateRequest(live.id, patch)
      return this.toView({ ...live, ...patch })
    }
    const created = await this.store.insertRequest({
      ...patch,
      source_workspace_id: source.id,
      requested_by: userId,
      rejected_by: null,
      rejected_at: null,
      started_at: null,
      finished_at: null,
      last_error: null,
    })
    return this.toView(created)
  }

  /** L'utilisateur valide l'aperçu qu'il a vu — CE hash, toujours vrai sur la donnée vivante. */
  async confirm(userId: string, requestId: string, hash: string): Promise<WorkspaceMergeRequestView> {
    const request = await this.ownRequest(userId, requestId)
    if (request.status !== 'previewed') throw new ConflictException('Cette demande n’attend plus votre validation')
    await this.assertHashStillTrue(request, hash)
    const patch = { status: 'awaiting_admin' as const, user_validated_at: new Date() }
    await this.store.updateRequest(request.id, patch)
    return this.toView({ ...request, ...patch })
  }

  async cancel(userId: string, requestId: string): Promise<WorkspaceMergeRequestView> {
    const request = await this.ownRequest(userId, requestId)
    if (!REPLACEABLE.includes(request.status)) throw new ConflictException('Cette demande ne s’annule plus')
    await this.store.updateRequest(request.id, { status: 'cancelled' })
    return this.toView({ ...request, status: 'cancelled' })
  }

  /** Les demandes de l'espace CIBLE, lisibles par ses seuls admins. */
  async pendingFor(userId: string, workspaceId: string): Promise<WorkspaceMergeRequestView[]> {
    await this.assertTargetAdmin(userId, workspaceId)
    const rows = await this.store.requestsForTarget(workspaceId, TARGET_VISIBLE)
    return Promise.all(rows.map(row => this.toView(row)))
  }

  async mine(userId: string): Promise<WorkspaceMergeRequestView[]> {
    const rows = await this.store.requestsBy(userId)
    return Promise.all(rows.map(row => this.toView(row)))
  }

  /** Un admin de la cible accepte le MÊME hash que l'utilisateur ; le job part avec lui. */
  async approve(userId: string, requestId: string, hash: string): Promise<WorkspaceMergeRequestView> {
    const request = await this.store.findRequest(requestId)
    if (!request) throw new NotFoundException('Demande introuvable')
    await this.assertTargetAdmin(userId, request.workspace_id)
    if (request.status !== 'awaiting_admin' || !request.user_validated_at) {
      throw new ConflictException('Cette demande n’attend pas de décision')
    }
    await this.assertHashStillTrue(request, hash)
    const patch = { status: 'approved' as const, admin_validated_by: userId, admin_validated_at: new Date() }
    await this.store.updateRequest(request.id, patch)
    await this.enqueue(request, `${request.id}-approve`)
    return this.toView({ ...request, ...patch })
  }

  async reject(userId: string, requestId: string): Promise<WorkspaceMergeRequestView> {
    const request = await this.store.findRequest(requestId)
    if (!request) throw new NotFoundException('Demande introuvable')
    await this.assertTargetAdmin(userId, request.workspace_id)
    if (request.status !== 'awaiting_admin') throw new ConflictException('Cette demande n’attend pas de décision')
    const patch = { status: 'rejected' as const, rejected_by: userId, rejected_at: new Date() }
    await this.store.updateRequest(request.id, patch)
    return this.toView({ ...request, ...patch })
  }

  /** Relancer un job coupé : le demandeur ou un admin de la cible. Le journal évite toute double copie. */
  async resume(userId: string, requestId: string): Promise<WorkspaceMergeRequestView> {
    const request = await this.store.findRequest(requestId)
    const isAdmin = request
      ? ADMIN_ROLES.includes((await this.store.roleIn(userId, request.workspace_id)) ?? '')
      : false
    if (!request || (request.requested_by !== userId && !isAdmin)) throw new NotFoundException('Demande introuvable')
    if (!['running', 'failed'].includes(request.status) || !request.admin_validated_at) {
      throw new ConflictException('Cette demande n’est pas à reprendre')
    }
    await this.enqueue(request, `${request.id}-resume-${Date.now()}`)
    return this.toView(request)
  }

  /**
   * Le job. SANS `write`, c'est une simulation : l'aperçu vivant, rien d'écrit. AVEC, il exige la double
   * validation et le hash validé, puis rejoue l'aperçu FIGÉ ligne à ligne — une ligne déjà journalisée
   * n'est jamais refaite. Une ligne qui serait COPIÉE mais a pris un doublon dans la cible depuis la
   * validation est proposée à la place : l'écriture ne devient jamais plus agressive que ce qui a été validé.
   */
  async run(
    requestId: string,
    options: { write?: boolean; hash?: string },
  ): Promise<{ written: boolean; preview: WorkspaceMergePreview }> {
    const request = await this.store.findRequest(requestId)
    if (!request) throw new NotFoundException('Demande introuvable')
    if (!options.write) {
      return { written: false, preview: await this.livePreview(request.source_workspace_id, request.workspace_id) }
    }
    if (!RUNNABLE.includes(request.status) || !request.user_validated_at || !request.admin_validated_at) {
      throw new ConflictException('Écriture refusée : la demande n’est pas validée')
    }
    if (options.hash !== request.preview_hash) throw new ConflictException('Écriture refusée : empreinte non validée')

    await this.store.updateRequest(request.id, {
      status: 'running',
      started_at: request.started_at ?? new Date(),
      last_error: null,
    })
    try {
      await this.applyFrozenPlan(request)
      await this.store.archiveSource(request.source_workspace_id, request.workspace_id, request.requested_by)
      await this.store.selectActiveWorkspace(request.requested_by, request.workspace_id)
      await this.store.updateRequest(request.id, { status: 'done', finished_at: new Date() })
    } catch (error) {
      const message = (error as Error).message.slice(0, 300)
      await this.store.updateRequest(request.id, { status: 'failed', last_error: message })
      this.logger.error('Rapatriement d’espace interrompu', { requestId: request.id, message })
      throw error
    }
    return { written: true, preview: request.preview }
  }

  private async applyFrozenPlan(request: MergeRequestRecord): Promise<void> {
    const recorded = new Map<string, MergeRecordedItem>()
    for (const item of await this.store.recordedItems(request.id, request.workspace_id))
      recorded.set(`${item.table}|${item.sourceId}`, item)
    const ownCopies = new Set([...recorded.values()].filter(i => i.outcome === 'copied').map(i => i.targetId))
    const live = await this.livePreview(request.source_workspace_id, request.workspace_id, ownCopies)
    const liveByKey = new Map(live.items.map(item => [`${item.table}|${item.sourceId}`, item]))

    for (const frozen of request.preview.items) {
      const key = `${frozen.table}|${frozen.sourceId}`
      if (recorded.has(key)) continue
      const item = this.effectiveItem(frozen, liveByKey.get(key), recorded)
      const step = await this.store.applyStep({
        requestId: request.id,
        sourceWorkspaceId: request.source_workspace_id,
        targetWorkspaceId: request.workspace_id,
        table: item.table,
        sourceId: item.sourceId,
        outcome: item.outcome,
        targetId: item.targetId,
        targetAccountId:
          item.table === 'contacts' && item.sourceAccountId
            ? (recorded.get(`accounts|${item.sourceAccountId}`)?.targetId ?? null)
            : null,
      })
      if (step.state === 'written') {
        recorded.set(key, {
          table: item.table,
          sourceId: item.sourceId,
          targetId: step.targetId,
          outcome: item.outcome,
        })
      }
    }
  }

  /** Le sort RETENU d'une ligne : jamais plus agressif que le figé, jamais plus que le vivant. */
  private effectiveItem(
    frozen: WorkspaceMergePlanItem,
    live: WorkspaceMergePlanItem | undefined,
    recorded: Map<string, MergeRecordedItem>,
  ): WorkspaceMergePlanItem {
    if (frozen.outcome !== 'copied') return frozen
    if (live && live.outcome !== 'copied') return live
    if (frozen.table === 'contacts' && frozen.sourceAccountId) {
      const account = recorded.get(`accounts|${frozen.sourceAccountId}`)
      if (!account || account.outcome !== 'copied' || !account.targetId) {
        return { ...frozen, outcome: 'held_with_account', targetId: null, duplicateKey: null }
      }
    }
    return frozen
  }

  /** L'aperçu calculé sur la donnée VIVANTE de la source et de la cible — et d'elles seules. */
  private async livePreview(
    sourceWorkspaceId: string,
    targetWorkspaceId: string,
    ignoreTargetIds: ReadonlySet<string | null> = new Set(),
  ): Promise<WorkspaceMergePreview> {
    const [accounts, contacts] = await Promise.all([
      this.store.activeAccounts(sourceWorkspaceId),
      this.store.activeContacts(sourceWorkspaceId),
    ])
    const duplicates = await this.store.targetDuplicates(targetWorkspaceId, duplicateLookupKeys(accounts, contacts))
    return buildMergePreview({
      sourceWorkspaceId,
      targetWorkspaceId,
      accounts,
      contacts,
      targetAccounts: duplicates.accounts.filter(row => !ignoreTargetIds.has(row.id)),
      targetContacts: duplicates.contacts.filter(row => !ignoreTargetIds.has(row.id)),
    })
  }

  private async assertHashStillTrue(request: MergeRequestRecord, hash: string): Promise<void> {
    if (hash !== request.preview_hash) throw new ConflictException('Cette validation ne porte pas sur l’aperçu affiché')
    const live = await this.livePreview(request.source_workspace_id, request.workspace_id)
    if (mergePreviewHash(live) !== request.preview_hash) {
      throw new ConflictException('Les données ont changé depuis l’aperçu : refaites l’aperçu')
    }
  }

  private async assertTargetAdmin(userId: string, workspaceId: string): Promise<void> {
    const role = await this.store.roleIn(userId, workspaceId)
    if (!role || !ADMIN_ROLES.includes(role)) {
      throw new ForbiddenException('Seul un administrateur de l’espace peut décider d’un rapatriement')
    }
  }

  /** Une demande d'un AUTRE utilisateur est introuvable — on ne confirme pas qu'elle existe. */
  private async ownRequest(userId: string, requestId: string): Promise<MergeRequestRecord> {
    const request = await this.store.findRequest(requestId)
    if (!request || request.requested_by !== userId) throw new NotFoundException('Demande introuvable')
    return request
  }

  private async enqueue(request: MergeRequestRecord, jobId: string): Promise<void> {
    await this.queue.add('merge', { requestId: request.id, hash: request.preview_hash, write: true }, { jobId })
  }

  private async toView(record: MergeRequestRecord): Promise<WorkspaceMergeRequestView> {
    const [source, target, recorded] = await Promise.all([
      this.store.workspace(record.source_workspace_id),
      this.store.workspace(record.workspace_id),
      this.store.recordedItems(record.id, record.workspace_id),
    ])
    return {
      id: record.id,
      status: record.status,
      sourceWorkspaceId: record.source_workspace_id,
      sourceWorkspaceName: source?.name ?? '',
      targetWorkspaceId: record.workspace_id,
      targetWorkspaceName: target?.name ?? '',
      requestedBy: record.requested_by,
      previewHash: record.preview_hash,
      tables: record.preview.tables,
      proposals: record.preview.items.filter(item => item.outcome === 'duplicate_proposed'),
      progress: { done: recorded.length, total: record.preview.items.length },
      userValidatedAt: record.user_validated_at?.toISOString() ?? null,
      adminValidatedAt: record.admin_validated_at?.toISOString() ?? null,
      finishedAt: record.finished_at?.toISOString() ?? null,
      lastError: record.last_error,
      createdAt: record.created_at.toISOString(),
    }
  }
}
