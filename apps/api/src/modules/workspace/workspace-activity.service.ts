import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type {
  PaginationMeta,
  WorkspaceActivityEventName,
  WorkspaceActivityItem,
  WorkspaceActivityPage,
  WorkspaceActivityQuery,
} from '@bellum/contracts'
import { workspaceActivityEventNames } from '@bellum/contracts'
import { ProductEventEntity } from '../../database/entities/product-event.entity'
import { WorkspaceContextService } from './workspace-context.service'

/** One raw journal row — the event plus the joined display labels. */
type ActivityRawRow = {
  event_id: string
  event_name: WorkspaceActivityEventName
  user_id: string
  properties: Record<string, unknown> | null
  occurred_at: Date
  actor_first_name: string | null
  actor_last_name: string | null
  actor_email: string | null
  account_name: string | null
  contact_name: string | null
}

const DEFAULT_LIMIT = 25

/**
 * The « Journal d'activité » read model (Théo p.21 P2 — « qui a lancé une
 * analyse, enrichi un contact, exporté, envoyé un message »). No new table:
 * this is a workspace-scoped, filtered view over the append-only
 * `product_events` stream, narrowed to the audit-relevant event set from
 * `@bellum/contracts` (analytics-only events like `account_viewed` or billing
 * never surface here).
 *
 * Scoping is STRICT `workspace_id = :id` — an event emitted without a
 * workspace (legacy rows, user-level events) is invisible, and another
 * tenant's events can never leak in. The route is additionally gated by the
 * `team:manage` RBAC permission (owner | admin | sales_ops) in the controller.
 */
@Injectable()
export class WorkspaceActivityService {
  constructor(
    @InjectRepository(ProductEventEntity)
    private readonly events: Repository<ProductEventEntity>,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  async list(userId: string, query: WorkspaceActivityQuery): Promise<WorkspaceActivityPage> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const limit = query.limit ?? DEFAULT_LIMIT
    const offset = query.offset ?? 0

    const qb = this.events
      .createQueryBuilder('event')
      .where('event.workspace_id = :workspaceId', { workspaceId })
      .andWhere('event.event_name IN (:...eventNames)', {
        eventNames: query.event ? [query.event] : [...workspaceActivityEventNames],
      })
    if (query.actorId) qb.andWhere('event.user_id = :actorId', { actorId: query.actorId })
    if (query.period) qb.andWhere('event.occurred_at >= :periodStart', { periodStart: periodStart(query.period) })

    const totalItems = await qb.getCount()

    // Joined display labels. The account/contact joins are pinned to the SAME
    // workspace as the event, so a planted foreign UUID in `properties` can
    // never resolve another tenant's company/contact name.
    const rows = await qb
      .leftJoin('profiles', 'profile', 'profile.user_id = event.user_id')
      .leftJoin(
        'accounts',
        'account',
        "CAST(account.id AS text) = event.properties->>'accountId' AND account.workspace_id = event.workspace_id",
      )
      .leftJoin(
        'contacts',
        'contact',
        "CAST(contact.id AS text) = event.properties->>'contactId' AND contact.workspace_id = event.workspace_id",
      )
      .select([
        'event.id AS event_id',
        'event.event_name AS event_name',
        'event.user_id AS user_id',
        'event.properties AS properties',
        'event.occurred_at AS occurred_at',
        'profile.first_name AS actor_first_name',
        'profile.last_name AS actor_last_name',
        'profile.email AS actor_email',
        'account.company_name AS account_name',
        'contact.full_name AS contact_name',
      ])
      .orderBy('event.occurred_at', 'DESC')
      .offset(offset)
      .limit(limit)
      .getRawMany<ActivityRawRow>()

    return {
      data: rows.map(mapActivityRow),
      pagination: buildPagination(totalItems, offset, limit),
    }
  }
}

function mapActivityRow(row: ActivityRawRow): WorkspaceActivityItem {
  const fullName = [row.actor_first_name, row.actor_last_name].filter(Boolean).join(' ').trim()
  return {
    id: row.event_id,
    event: row.event_name,
    actor: {
      id: row.user_id,
      name: fullName || null,
      email: row.actor_email ?? null,
    },
    target: resolveTarget(row),
    detail: resolveDetail(row),
    occurredAt:
      row.occurred_at instanceof Date ? row.occurred_at.toISOString() : new Date(row.occurred_at).toISOString(),
  }
}

/** Compact label of what the action touched. Company/contact names come from
 *  the workspace-pinned joins; team/integration events carry a `target`
 *  (invited email…) or `provider` in their sanitized properties. */
function resolveTarget(row: ActivityRawRow): string | null {
  return (
    row.contact_name ??
    row.account_name ??
    readString(row.properties, 'target') ??
    readString(row.properties, 'provider') ??
    readString(row.properties, 'destination') ??
    null
  )
}

/** Optional display dimension (channel / destination / assigned role / scope). */
function resolveDetail(row: ActivityRawRow): string | null {
  switch (row.event_name) {
    case 'message_sent':
      return readString(row.properties, 'channel')
    case 'export_performed':
      return readString(row.properties, 'destination')
    case 'member_invited':
    case 'member_role_changed':
      return readString(row.properties, 'role')
    case 'contact_enriched':
      return readString(row.properties, 'provider')
    case 'analysis_started':
    case 'analysis_completed':
      return readString(row.properties, 'scope_mode')
    default:
      return null
  }
}

function readString(properties: Record<string, unknown> | null, key: string): string | null {
  const value = properties?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function buildPagination(totalItems: number, offset: number, size: number): PaginationMeta {
  const currentPage = Math.floor(offset / size) + 1
  const totalPages = Math.max(1, Math.ceil(totalItems / size))
  return {
    currentPage,
    size,
    totalItems,
    totalPages,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
  }
}

/** Rolling-window start, aligned with the actions-history period filter. */
function periodStart(period: NonNullable<WorkspaceActivityQuery['period']>): Date {
  const days = period === '90d' ? 90 : period === '30d' ? 30 : 7
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date
}
