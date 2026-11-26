import { Inject, Injectable, Logger } from '@nestjs/common'
import { crmMirrorActivityKind, type CrmProvider } from '@bellum/contracts'
import { CrmAdapterRegistry } from '../crm/adapter/crm-adapter.registry'
import type { CrmAdapter } from '../crm/adapter/crm-adapter'
import type {
  CrmActivityPage,
  CrmDealPage,
  CrmOwnerPage,
  CrmPipelinePage,
  CrmReadOptions,
} from '../crm/adapter/crm-read-types'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { CrmMirrorEntity, CrmMirrorSync, CrmMirrorSyncResult } from './crm-mirror.port'
import { CRM_MIRROR_STORE, type CrmMirrorStore, type MirrorRow, type MirrorTable } from './crm-mirror.store'

type Read = NonNullable<CrmAdapter['read']>
type Deal = CrmDealPage['deals'][number]
type Activity = CrmActivityPage['activities'][number]
type Owner = CrmOwnerPage['owners'][number]
type Pipeline = CrmPipelinePage['pipelines'][number]

/** L'ordre des passages : propriétaires et pipelines d'abord (une affaire y renvoie), activités en dernier. */
const ORDER: readonly CrmMirrorEntity[] = ['owners', 'pipelines', 'deals', 'activities']
const PAGE_SIZE = 100

const date = (iso: string | null | undefined): Date | null => {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : new Date(ms)
}
const currency = (code: string | null | undefined): string | null =>
  code && /^[A-Za-z]{3}$/.test(code.trim()) ? code.trim().toUpperCase() : null
const url = (value: string | null | undefined): string | null => (value && /^https?:\/\//.test(value) ? value : null)

/**
 * SYNC-A (décision Louis 19/10/2026) — LE MIROIR CRM : copie dans Bellum les affaires, activités,
 * propriétaires et pipelines du CRM branché par l'espace, par l'adaptateur commun (`read.*`).
 *
 * Ce qu'il tient :
 *  - upsert par la clé `(workspace_id, provider, external_id)` — rejoué, il ne duplique rien ;
 *  - rattachement aux comptes et contacts par les LIENS EXISTANTS (`sync_links`) — jamais par le nom ;
 *    une activité liée à une affaire hérite du compte de l'affaire ;
 *  - `mode: 'full'` : ce que le CRM ne rend plus est ARCHIVÉ (jamais DELETE) — seulement sur une
 *    lecture COMPLÈTE et sans erreur (une absence dans une lecture tronquée ne prouve rien) ;
 *  - une fiche modifiée dans Bellum depuis sa dernière copie n'est pas écrasée (une correction humaine
 *    gagne toujours) ;
 *  - une entité en échec (429, jeton périmé, délai dépassé) ne prive pas les autres : l'erreur est
 *    NOMMÉE dans le résultat, rien n'est archivé pour elle ;
 *  - un objet que le CRM n'expose pas n'est ni lu ni compté (absent, jamais « 0 ») ;
 *  - sans CRM branché : no-op strict, zéro lecture.
 *
 * Appelé par la reprise (SYNC-B) et la synchro fréquente (SYNC-C) sous `CRM_MIRROR_SYNC`.
 */
@Injectable()
export class CrmMirrorService implements CrmMirrorSync {
  /** La borne de volume par entité et par passage (PAGE_SIZE × MAX_PAGES fiches). */
  static readonly MAX_PAGES = 50
  private readonly logger = new Logger(CrmMirrorService.name)

  constructor(
    private readonly adapters: CrmAdapterRegistry,
    @Inject(CRM_MIRROR_STORE) private readonly store: CrmMirrorStore,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  async syncProvider(input: {
    readonly workspaceId: string
    readonly provider: CrmProvider
    readonly mode: 'full' | 'incremental'
    readonly since?: Date
  }): Promise<CrmMirrorSyncResult> {
    const { workspaceId, provider, mode } = input
    const counts: Partial<Record<CrmMirrorEntity, number>> = {}
    const errors: Array<{ entity: CrmMirrorEntity; message: string }> = []
    let archived = 0

    const read = this.adapters.get(provider)?.read
    const userId = read ? await this.store.connectionUser(workspaceId, provider) : null
    if (!read || !userId) return { counts, archived, errors }
    const exposed = ORDER.filter(entity => read[entity] !== undefined)

    // Les adaptateurs lisent le CRM de l'espace ACTIF de l'utilisateur : s'il n'est pas celui-ci,
    // on ne copie RIEN (le CRM d'un autre espace n'entre jamais dans celui-ci).
    const { workspaceId: active } = await this.workspaceContext.resolveActiveWorkspace(userId)
    if (active !== workspaceId) {
      const message = "L'espace actif de la personne qui a branché ce CRM n'est pas cet espace : rien n'a été copié."
      return { counts, archived, errors: exposed.map(entity => ({ entity, message })) }
    }

    const since = mode === 'incremental' && input.since ? input.since.toISOString() : undefined
    const links = await this.store.links(workspaceId, provider)
    const ctx = { workspaceId, provider, links }

    for (const entity of exposed) {
      try {
        const { rows, complete } = await this.readAll(entity, read, userId, since)
        const written = await this.write(entity, rows, ctx)
        counts[entity] = written
        if (mode === 'full' && complete) archived += await this.archive(entity, rows, ctx)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        errors.push({ entity, message })
        this.logger.warn(`Miroir CRM ${provider}/${entity} non abouti`, { workspaceId, error: message })
      }
    }
    return { counts, archived, errors }
  }

  /** Lit TOUTES les pages d'une entité, bornées ; `complete` = lue jusqu'au bout. */
  private async readAll(
    entity: CrmMirrorEntity,
    read: Read,
    userId: string,
    since: string | undefined,
  ): Promise<{ rows: Array<Deal | Activity | Owner | Pipeline>; complete: boolean }> {
    const rows: Array<Deal | Activity | Owner | Pipeline> = []
    let after: string | undefined
    for (let page = 0; page < CrmMirrorService.MAX_PAGES; page++) {
      const opts: CrmReadOptions = { limit: PAGE_SIZE, ...(after ? { after } : {}), ...(since ? { since } : {}) }
      const result = await this.readPage(entity, read, userId, opts)
      rows.push(...result.items)
      if (!result.nextAfter) return { rows, complete: true }
      after = result.nextAfter
    }
    return { rows, complete: false }
  }

  private async readPage(
    entity: CrmMirrorEntity,
    read: Read,
    userId: string,
    opts: CrmReadOptions,
  ): Promise<{ items: Array<Deal | Activity | Owner | Pipeline>; nextAfter: string | null }> {
    switch (entity) {
      case 'deals': {
        const page = await read.deals!(userId, opts)
        return { items: page.deals, nextAfter: page.nextAfter }
      }
      case 'activities': {
        const page = await read.activities!(userId, opts)
        return { items: page.activities, nextAfter: page.nextAfter }
      }
      case 'owners': {
        const page = await read.owners!(userId, opts)
        return { items: page.owners, nextAfter: page.nextAfter }
      }
      case 'pipelines': {
        const page = await read.pipelines!(userId, opts)
        return { items: page.pipelines, nextAfter: page.nextAfter }
      }
    }
  }

  /** Écrit les fiches lues (sauf celles modifiées dans Bellum) ; rend le nombre écrit. */
  private async write(
    entity: CrmMirrorEntity,
    items: ReadonlyArray<Deal | Activity | Owner | Pipeline>,
    ctx: Ctx,
  ): Promise<number> {
    const now = new Date()
    const base = (id: string, modifiedAt: string | null | undefined, link?: string | null) => ({
      workspace_id: ctx.workspaceId,
      provider: ctx.provider,
      external_id: id,
      crm_updated_at: date(modifiedAt),
      crm_url: url(link),
      archived_at: null,
      synced_at: now,
      updated_at: now,
    })
    const table = TABLE_OF[entity]
    const kept = await this.withoutHumanEdits(table, items.map(item => item.id).filter(Boolean), ctx)
    const fresh = items.filter(item => item.id && kept.has(item.id))

    switch (entity) {
      case 'owners': {
        const rows = (fresh as Owner[]).map(owner => ({
          ...base(owner.id, null),
          crm_custom_fields: {},
          name: owner.name,
          email: owner.email,
        }))
        await this.store.upsert('crm_owners', rows)
        return rows.length
      }
      case 'pipelines': {
        const pipelines = fresh as Pipeline[]
        await this.store.upsert(
          'crm_pipelines',
          pipelines.map(pipeline => ({ ...base(pipeline.id, null), crm_custom_fields: {}, label: pipeline.label })),
        )
        const ids = await this.store.pipelineIds(ctx.workspaceId, ctx.provider)
        const stages: MirrorRow[] = pipelines.flatMap(pipeline => {
          const pipelineId = ids.get(pipeline.id)
          return pipelineId
            ? pipeline.stages.map(stage => ({
                ...base(stage.id, null),
                crm_custom_fields: {},
                pipeline_id: pipelineId,
                label: stage.label,
                position: stage.position,
                status: stage.status,
              }))
            : []
        })
        await this.store.upsert('crm_stages', stages)
        return pipelines.length
      }
      case 'deals': {
        const labels = await this.store.stageLabels(ctx.workspaceId, ctx.provider)
        const rows = (fresh as Deal[]).map(deal => ({
          ...base(deal.id, deal.modifiedAt, deal.url),
          crm_custom_fields: deal.customFields ?? {},
          title: deal.title,
          pipeline_external_id: deal.pipelineId ?? null,
          stage_external_id: deal.stageId ?? null,
          stage_label: deal.stage ?? (deal.stageId ? (labels.get(deal.stageId) ?? null) : null),
          // `numeric` : le montant voyage en texte, jamais arrondi par un flottant.
          amount: deal.amount === null || !Number.isFinite(deal.amount) ? null : String(deal.amount),
          currency: currency(deal.currency),
          status: deal.status,
          lost_reason: deal.lostReason ?? null,
          crm_created_at: date(deal.createdAt),
          expected_close_date: date(deal.closeDate),
          closed_at: date(deal.closedAt),
          owner_external_id: deal.ownerId ?? null,
          account_external_id: deal.accountId,
          account_id: deal.accountId ? (ctx.links.accounts.get(deal.accountId) ?? null) : null,
          contact_external_ids: deal.contactIds ?? [],
        }))
        await this.store.upsert('crm_deals', rows)
        return rows.length
      }
      case 'activities': {
        const dealAccounts = await this.store.dealAccounts(ctx.workspaceId, ctx.provider)
        const rows = (fresh as Activity[]).map(activity => {
          const account =
            (activity.accountId ? ctx.links.accounts.get(activity.accountId) : undefined) ??
            (activity.dealId ? dealAccounts.get(activity.dealId) : undefined) ??
            null
          return {
            ...base(activity.id, activity.modifiedAt, activity.url),
            crm_custom_fields: {},
            kind: crmMirrorActivityKind(activity.kind),
            subject: activity.subject,
            occurred_at: date(activity.dueAt),
            done: activity.done,
            owner_external_id: activity.ownerId ?? null,
            account_external_id: activity.accountId ?? null,
            account_id: account,
            contact_external_id: activity.contactId ?? null,
            contact_id: activity.contactId ? (ctx.links.contacts.get(activity.contactId) ?? null) : null,
            deal_external_id: activity.dealId ?? null,
          }
        })
        await this.store.upsert('crm_activities', rows)
        return rows.length
      }
    }
  }

  /** Les identifiants à écrire : ceux qui n'ont PAS été modifiés dans Bellum depuis leur copie. */
  private async withoutHumanEdits(table: MirrorTable, ids: readonly string[], ctx: Ctx): Promise<Set<string>> {
    const edited = await this.store.humanEdited(table, ctx.workspaceId, ctx.provider, ids)
    return new Set(ids.filter(id => !edited.has(id)))
  }

  /** Mode full, lecture complète : archive ce qui n'a pas été relu (étapes avec leurs pipelines). */
  private async archive(
    entity: CrmMirrorEntity,
    items: ReadonlyArray<Deal | Activity | Owner | Pipeline>,
    ctx: Ctx,
  ): Promise<number> {
    const seen = items.map(item => item.id).filter(Boolean)
    let archived = await this.store.archiveMissing(TABLE_OF[entity], ctx.workspaceId, ctx.provider, seen)
    if (entity === 'pipelines') {
      const stages = (items as Pipeline[]).flatMap(pipeline => pipeline.stages.map(stage => stage.id))
      archived += await this.store.archiveMissing('crm_stages', ctx.workspaceId, ctx.provider, stages)
    }
    return archived
  }
}

type Ctx = {
  workspaceId: string
  provider: CrmProvider
  links: { accounts: ReadonlyMap<string, string>; contacts: ReadonlyMap<string, string> }
}

const TABLE_OF: Readonly<Record<CrmMirrorEntity, MirrorTable>> = {
  deals: 'crm_deals',
  activities: 'crm_activities',
  owners: 'crm_owners',
  pipelines: 'crm_pipelines',
}
