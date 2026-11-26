import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import { isFailure, type Result } from '@bellum/utils'
import {
  ANALYSIS_BATCH_MAX_ITEMS,
  analysisBatchItemKey,
  batchItemStateFromAnalysis,
  dedupeAnalysisBatchInputs,
  isTerminalBatchItemState,
  startAnalysisSchema,
  summarizeAnalysisBatch,
  type AnalysisBatch,
  type AnalysisBatchCandidate,
  type AnalysisBatchInput,
  type AnalysisBatchPreview,
  type AnalysisBatchPreviewItem,
  type AnalysisBatchSource,
  type LauraContextMode,
} from '@bellum/contracts'
import { AnalysisBatchEntity } from '../../database/entities/analysis-batch.entity'
import { AnalysisBatchItemEntity } from '../../database/entities/analysis-batch-item.entity'
import { ANALYSIS_WORKER_OPTIONS } from '../analysis/analysis.worker'

/** Combien d'entités proposer pour lever une ambiguïté. */
const MAX_CANDIDATES = 5
/** Résolutions de nom menées en parallèle — l'autocomplétion du registre, jamais un débit. */
const RESOLVE_CONCURRENCY = 5

type BatchRequest = {
  source: AnalysisBatchSource
  items: AnalysisBatchInput[]
  /** #2922 — le mode choisi sur la chip `analysis_batch`. Absent : défaut de l'espace. */
  context_mode?: LauraContextMode
}

type AnalysisStatusView = {
  state: 'active' | 'completed' | 'failed' | 'canceled' | 'not_found'
  phase: string | null
  completedPhases: string[]
  /** #2283.32 — voir `batchItemStateFromAnalysis` (contrat). */
  entityAmbiguity?: { candidates: AnalysisBatchCandidate[] } | null
}

/**
 * GA-07 — CE QUE LE LOT EMPRUNTE AUX AUTRES MODULES, fourni par le CONTRÔLEUR.
 *
 * Le service ne va chercher AUCUN service d'un autre module : l'orchestration
 * vit au bord, là où vit le geste (`AnalysisBatchesController.ports`). Ici, le
 * lot ne connaît que la FORME de ce qu'il appelle — l'analyse unitaire
 * (devis, lancement, état, annulation), la résolution d'un nom au registre et
 * l'espace de l'appelant, déjà résolu avec son périmètre.
 */
export interface AnalysisBatchPorts {
  workspaceId: string
  isDemo: () => Promise<boolean>
  planLaunch: (
    params: { companyName: string; siren?: string },
    userId: string,
  ) => Promise<{ scenario: 'demo' } | { scenario: 'cache_hit' } | { scenario: 'fresh'; credits: number }>
  start: (
    dto: { company_name: string; siren?: string },
    userId: string,
  ) => Promise<Result<{ accountId: string; launched: boolean; reason?: string }, { code: string }>>
  getStatus: (accountId: string, userId: string) => Promise<Result<AnalysisStatusView, unknown>>
  cancel: (accountId: string, userId: string) => Promise<unknown>
  searchCompanies: (
    q: string,
    limit: number,
  ) => Promise<{ suggestions?: Array<{ name: string; siren: string; city?: string | null }> }>
}

function normalizedName(name: string): string {
  return analysisBatchItemKey({ name })
}

/** Exécute `task` sur chaque élément, `limit` à la fois, en gardant l'ordre. */
async function mapLimited<T, R>(values: readonly T[], limit: number, task: (value: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(values.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) {
      const index = next++
      out[index] = await task(values[index] as T)
    }
  })
  await Promise.all(workers)
  return out
}

/**
 * #2293.5 / .6 (LAU-FINAL-034) — LE LOT D'ANALYSES MULTI-COMPTES.
 *
 * Le parent (`analysis_batches`) suit ses sous-jobs (`analysis_batch_items`) ;
 * chaque sous-job lancé EST une analyse unitaire ordinaire
 * (`AnalysisService.start`) — même file BullMQ, même idempotence, même débit,
 * même remboursement sur échec. Ce service n'invente AUCUN second chemin de
 * débit : il additionne ce que l'analyse unitaire débite déjà, candidat par
 * candidat, et ne dit « débité » que sur un lancement réellement parti.
 *
 * Rien ne part sans geste : `preview` ne lance ni ne débite ; `create`,
 * `retry` et `confirm` sont les seuls gestes qui lancent, tous derrière
 * `analysis:run` au contrôleur.
 */
@Injectable()
export class AnalysisBatchesService {
  private readonly logger = new Logger(AnalysisBatchesService.name)

  constructor(
    @InjectRepository(AnalysisBatchEntity) private readonly batches: Repository<AnalysisBatchEntity>,
    @InjectRepository(AnalysisBatchItemEntity) private readonly items: Repository<AnalysisBatchItemEntity>,
  ) {}

  /**
   * #2293.4 — la préview, avant tout lancement : entités résolues, ambiguïtés,
   * doublons, déjà analysées (rouvertes sans débit), analyses neuves, coût
   * EXACT (la route que le lanceur débite, `planLaunch`), limite du lot,
   * exécutions parallèles. Aucune durée : rien ne la mesure à l'avance.
   */
  async preview(ports: AnalysisBatchPorts, userId: string, request: BatchRequest): Promise<AnalysisBatchPreview> {
    const demo = await ports.isDemo()
    const { unique, duplicates: inputDuplicates } = dedupeAnalysisBatchInputs(request.items)
    const resolved = await mapLimited(unique, RESOLVE_CONCURRENCY, input => this.resolveOne(ports, userId, input))
    // Deux saisies différentes peuvent désigner la MÊME entité une fois résolues.
    const { unique: items, duplicates: resolvedDuplicates } = dedupeAnalysisBatchInputs(resolved)
    const counts = { resolved: 0, toConfirm: 0, alreadyAnalyzed: 0, fresh: 0 }
    let totalCredits = 0
    for (const item of items) {
      if (item.resolution === 'to_confirm') counts.toConfirm += 1
      else counts.resolved += 1
      if (item.scenario === 'cache_hit') counts.alreadyAnalyzed += 1
      if (item.scenario === 'fresh') {
        counts.fresh += 1
        totalCredits += item.credits ?? 0
      }
    }
    return {
      items,
      duplicates: inputDuplicates + resolvedDuplicates,
      counts,
      totalCredits,
      maxItems: ANALYSIS_BATCH_MAX_ITEMS,
      parallelRuns: ANALYSIS_WORKER_OPTIONS.concurrency,
      demo,
    }
  }

  /** Crée le parent, un sous-job par entreprise, et lance ceux qui sont résolus. */
  async create(ports: AnalysisBatchPorts, userId: string, request: BatchRequest): Promise<AnalysisBatch> {
    const preview = await this.preview(ports, userId, request)
    const workspaceId = ports.workspaceId
    const batch = await this.batches.save(
      this.batches.create({
        workspace_id: workspaceId,
        created_by: userId,
        source: request.source,
        canceled_at: null,
        // #2922 — persisté pour que `retry`/`confirm` relancent avec le MÊME
        // mode : `null`, jamais deviné, quand aucun choix n'a été fait.
        context_mode: request.context_mode ?? null,
      }),
    )
    const rows = preview.items.map((item, position) =>
      this.items.create({
        batch_id: batch.id,
        workspace_id: workspaceId,
        position,
        name: item.name,
        siren: item.siren,
        account_id: null,
        state: item.resolution,
        candidates: item.candidates,
        failure_code: null,
        charged: false,
      }),
    )
    await this.items.save(rows)
    // L'origine « suggestion » d'une saisie suit SON sous-job (télémétrie du run seulement).
    const origin = new Map<string, AnalysisBatchInput>()
    for (const input of request.items) {
      if (!input.suggestion_id) continue
      origin.set(analysisBatchItemKey({ name: input.name }), input)
      if (input.siren) origin.set(analysisBatchItemKey({ name: '', siren: input.siren }), input)
    }
    // #2293.7 — séquentiel et isolé : une entreprise en erreur ne bloque pas les suivantes.
    for (const row of rows) {
      if (row.state !== 'resolved') continue
      const source =
        (row.siren ? origin.get(analysisBatchItemKey({ name: '', siren: row.siren })) : undefined) ??
        origin.get(analysisBatchItemKey({ name: row.name }))
      await this.launch(ports, row, userId, source, batch.context_mode)
    }
    return this.toView(batch, rows)
  }

  /**
   * `createdBy` : le cloisonnement de portefeuille de Laura (#4611) — seuls les lots lancés par cette personne.
   * `live` (#4671) : les ports de l'appelant — sans eux la liste rend l'état STOCKÉ, qui ne bouge qu'à l'ouverture
   * d'un lot ; avec eux, chaque sous-job en vol est relu sur son analyse, comme le fait `get`.
   */
  async list(
    workspaceId: string,
    createdBy?: string,
    live?: { ports: AnalysisBatchPorts; userId: string },
  ): Promise<AnalysisBatch[]> {
    const batches = await this.batches.find({
      where: createdBy ? { workspace_id: workspaceId, created_by: createdBy } : { workspace_id: workspaceId },
      order: { created_at: 'DESC' },
      take: 20,
    })
    const views: AnalysisBatch[] = []
    for (const batch of batches) {
      const rows = await this.itemsOf(batch.id)
      // #4671 — le compteur « en cours » et l'état réel d'un lot sortent du même endroit : l'analyse de chaque sous-job.
      if (live) await this.refresh(live.ports, rows, live.userId)
      views.push(this.toView(batch, rows))
    }
    return views
  }

  /** Le lot, ses sous-jobs mis à jour depuis LEUR analyse. */
  async get(ports: AnalysisBatchPorts, userId: string, batchId: string): Promise<AnalysisBatch> {
    const batch = await this.findBatch(ports.workspaceId, batchId)
    const rows = await this.itemsOf(batch.id)
    await this.refresh(ports, rows, userId)
    return this.toView(batch, rows)
  }

  /**
   * Annuler le lot : les sous-jobs pas encore partis sont annulés, ceux en vol
   * passent par l'annulation UNITAIRE — qui rembourse le crédit du run arrêté.
   * Ce qui est déjà terminé le reste.
   */
  async cancel(ports: AnalysisBatchPorts, userId: string, batchId: string): Promise<AnalysisBatch> {
    const batch = await this.findBatch(ports.workspaceId, batchId)
    const rows = await this.itemsOf(batch.id)
    await this.refresh(ports, rows, userId)
    for (const row of rows) {
      if (isTerminalBatchItemState(row.state)) continue
      if (row.account_id && (row.state === 'queued' || row.state === 'running')) {
        try {
          await ports.cancel(row.account_id, userId)
        } catch (err) {
          this.logger.warn('Batch cancel: one analysis could not be canceled', {
            batchId,
            accountId: row.account_id,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
      row.state = 'canceled'
    }
    await this.items.save(rows)
    batch.canceled_at = new Date()
    await this.batches.save(batch)
    return this.toView(batch, rows)
  }

  /** Reprise : relance les seuls sous-jobs échoués (un run relancé est débité comme toute relance). */
  async retry(ports: AnalysisBatchPorts, userId: string, batchId: string): Promise<AnalysisBatch> {
    const batch = await this.findBatch(ports.workspaceId, batchId)
    if (batch.canceled_at) throw new ConflictException('batch_canceled')
    const rows = await this.itemsOf(batch.id)
    await this.refresh(ports, rows, userId)
    for (const row of rows) {
      // #2922 — le MÊME mode que le lancement d'origine, jamais un retour
      // silencieux au défaut de l'espace.
      if (row.state === 'failed') await this.launch(ports, row, userId, undefined, batch.context_mode)
    }
    return this.toView(batch, rows)
  }

  /** Lever une ambiguïté : l'entité choisie est lancée, ce sous-job seulement. */
  async confirm(
    ports: AnalysisBatchPorts,
    userId: string,
    batchId: string,
    itemId: string,
    siren: string,
  ): Promise<AnalysisBatch> {
    const batch = await this.findBatch(ports.workspaceId, batchId)
    if (batch.canceled_at) throw new ConflictException('batch_canceled')
    const rows = await this.itemsOf(batch.id)
    const row = rows.find(candidate => candidate.id === itemId)
    if (!row) throw new NotFoundException('batch_item_not_found')
    if (row.state !== 'to_confirm') throw new ConflictException('batch_item_not_awaiting_confirmation')
    row.siren = siren
    row.state = 'resolved'
    // #2922 — le MÊME mode que le lancement d'origine.
    await this.launch(ports, row, userId, undefined, batch.context_mode)
    return this.toView(batch, rows)
  }

  /**
   * #2283.32 — exclure du lot, l'AUTRE issue d'une ambiguïté (avec « demander
   * une résolution » — `confirm` ci-dessus, ou ouvrir le dossier sur
   * `needs_resolution`, #2284.65-.69). Seuls les deux états où une DÉCISION
   * humaine reste ouverte sont exclus : `to_confirm` (aucun lancement n'a
   * jamais eu lieu, rien à rembourser) et `needs_resolution` (l'analyse a
   * ABOUTI et reste due — exclure ne l'efface pas, seul ce sous-job quitte le
   * suivi du lot). Un état déjà tranché (résolu, en vol, terminé, échoué,
   * annulé) ne s'exclut pas : il se relance ou s'annule, jamais ne se retire.
   */
  async exclude(ports: AnalysisBatchPorts, userId: string, batchId: string, itemId: string): Promise<AnalysisBatch> {
    const batch = await this.findBatch(ports.workspaceId, batchId)
    if (batch.canceled_at) throw new ConflictException('batch_canceled')
    const rows = await this.itemsOf(batch.id)
    const row = rows.find(candidate => candidate.id === itemId)
    if (!row) throw new NotFoundException('batch_item_not_found')
    if (row.state !== 'to_confirm' && row.state !== 'needs_resolution') {
      throw new ConflictException('batch_item_not_excludable')
    }
    row.state = 'canceled'
    await this.items.save(row)
    return this.toView(batch, rows)
  }

  // ─── interne ────────────────────────────────────────────────────────────

  private async resolveOne(
    ports: AnalysisBatchPorts,
    userId: string,
    input: AnalysisBatchInput,
  ): Promise<AnalysisBatchPreviewItem> {
    const plan = await ports.planLaunch({ companyName: input.name, siren: input.siren }, userId)
    if (plan.scenario === 'demo') return this.previewItem(input.name, input.siren ?? null, 'demo', 0)
    if (plan.scenario === 'cache_hit') return this.previewItem(input.name, input.siren ?? null, 'cache_hit', 0)
    if (input.siren) return this.previewItem(input.name, input.siren, 'fresh', plan.credits)

    // Un nom seul : le registre dit s'il désigne UNE entité. Sinon, on ne devine pas.
    const response = await ports.searchCompanies(input.name, MAX_CANDIDATES)
    const candidates: AnalysisBatchCandidate[] = (response.suggestions ?? [])
      .filter(suggestion => /^\d{9}$/.test(suggestion.siren ?? ''))
      .slice(0, MAX_CANDIDATES)
      .map(suggestion => ({ name: suggestion.name, siren: suggestion.siren, city: suggestion.city || null }))
    const exact = candidates.filter(candidate => normalizedName(candidate.name) === normalizedName(input.name))
    const single = candidates.length === 1 ? candidates[0] : exact.length === 1 ? exact[0] : undefined
    if (!single) {
      return { name: input.name, siren: null, resolution: 'to_confirm', candidates, scenario: null, credits: null }
    }
    const resolvedPlan = await ports.planLaunch({ companyName: input.name, siren: single.siren }, userId)
    if (resolvedPlan.scenario === 'fresh')
      return this.previewItem(input.name, single.siren, 'fresh', resolvedPlan.credits)
    return this.previewItem(input.name, single.siren, resolvedPlan.scenario, 0)
  }

  private previewItem(
    name: string,
    siren: string | null,
    scenario: 'fresh' | 'cache_hit' | 'demo',
    credits: number,
  ): AnalysisBatchPreviewItem {
    return { name, siren, resolution: 'resolved', candidates: [], scenario, credits }
  }

  /**
   * Lance UN sous-job par le chemin de l'analyse unitaire. `charged` n'est vrai
   * que pour une analyse NEUVE réellement partie (`launched` sans raison) : un
   * dossier rouvert, une démo ou un run déjà en vol ne débitent rien.
   */
  private async launch(
    ports: AnalysisBatchPorts,
    row: AnalysisBatchItemEntity,
    userId: string,
    origin?: Pick<AnalysisBatchInput, 'suggestion_id' | 'suggestion_reason' | 'suggestion_criteria'>,
    // #2922 — le mode choisi sur la chip du lot, `null`/absent = défaut de
    // l'espace (résolu par `AnalysisService.start` lui-même, comme un
    // lancement unitaire sans mode).
    contextMode?: LauraContextMode | null,
  ): Promise<void> {
    const dto = startAnalysisSchema.safeParse({
      company_name: row.name,
      ...(row.siren ? { siren: row.siren } : {}),
      ...(origin?.suggestion_id ? { suggestion_id: origin.suggestion_id } : {}),
      ...(origin?.suggestion_reason ? { suggestion_reason: origin.suggestion_reason } : {}),
      // #3819 (lot RBB) — les critères Découvrir de CETTE saisie suivent son sous-job.
      ...(origin?.suggestion_criteria ? { suggestion_criteria: origin.suggestion_criteria } : {}),
      ...(contextMode ? { context_mode: contextMode } : {}),
    })
    if (!dto.success) {
      row.state = 'failed'
      row.failure_code = 'invalid_name'
      await this.items.save(row)
      return
    }
    try {
      const result = await ports.start(dto.data, userId)
      if (isFailure(result)) {
        row.state = 'failed'
        row.failure_code = result.problem.code
      } else {
        row.account_id = result.output.accountId
        row.failure_code = null
        row.state = result.output.launched ? 'queued' : 'done'
        row.charged = result.output.launched && !result.output.reason
      }
    } catch (err) {
      row.state = 'failed'
      row.failure_code = 'launch_error'
      this.logger.warn('Batch launch: one analysis failed to start', {
        batchId: row.batch_id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    await this.items.save(row)
  }

  /** Relit l'état de chaque sous-job EN VOL sur son analyse ; persiste ce qui a bougé. */
  private async refresh(ports: AnalysisBatchPorts, rows: AnalysisBatchItemEntity[], userId: string): Promise<void> {
    const inFlight = rows.filter(row => row.account_id && (row.state === 'queued' || row.state === 'running'))
    if (inFlight.length === 0) return
    const changed: AnalysisBatchItemEntity[] = []
    for (const row of inFlight) {
      try {
        const status = await ports.getStatus(row.account_id as string, userId)
        if (isFailure(status)) continue
        const next = batchItemStateFromAnalysis(status.output)
        if (next && next !== row.state) {
          row.state = next
          // #2283.32 — l'ambiguïté trouvée PENDANT l'analyse porte ses propres
          // candidats, comme `to_confirm` porte les siens AVANT lancement.
          if (next === 'needs_resolution') row.candidates = status.output.entityAmbiguity?.candidates ?? []
          changed.push(row)
        }
      } catch {
        // Une lecture en échec ne DEVINE pas un état : on garde le dernier connu.
      }
    }
    if (changed.length > 0) await this.items.save(changed)
  }

  private async findBatch(workspaceId: string, batchId: string): Promise<AnalysisBatchEntity> {
    const batch = await this.batches.findOne({ where: { id: batchId, workspace_id: workspaceId } })
    if (!batch) throw new NotFoundException('batch_not_found')
    return batch
  }

  private async itemsOf(batchId: string): Promise<AnalysisBatchItemEntity[]> {
    const rows = await this.items.find({ where: { batch_id: batchId }, order: { position: 'ASC' } })
    return [...rows].sort((a, b) => a.position - b.position)
  }

  private toView(batch: AnalysisBatchEntity, rows: AnalysisBatchItemEntity[]): AnalysisBatch {
    const canceledAt = batch.canceled_at ? new Date(batch.canceled_at).toISOString() : null
    const summary = summarizeAnalysisBatch(
      rows.map(row => row.state),
      canceledAt,
    )
    return {
      id: batch.id,
      source: batch.source,
      createdAt: batch.created_at ? new Date(batch.created_at).toISOString() : new Date().toISOString(),
      canceledAt,
      status: summary.status,
      counts: summary.counts,
      total: summary.total,
      charged: rows.filter(row => row.charged).length,
      contextMode: batch.context_mode ?? null,
      items: rows.map(row => ({
        id: row.id,
        position: row.position,
        name: row.name,
        siren: row.siren ?? null,
        state: row.state,
        accountId: row.account_id ?? null,
        candidates: row.candidates ?? [],
        failureCode: row.failure_code ?? null,
        charged: Boolean(row.charged),
      })),
    }
  }
}
