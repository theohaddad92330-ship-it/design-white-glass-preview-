import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import type { CrmMirrorAccountView, CrmMirrorSource, CrmProvider } from '@bellum/contracts'
import { CrmDealEntity } from '../../database/entities/crm-mirror.entity'
import type { CrmDealPage, CrmReadOptions } from '../crm/adapter/crm-read-types'

/** Une lecture d'affaires à la forme de `read.deals` de l'adaptateur commun. */
type MirrorDealsRead = (userId: string, opts: CrmReadOptions) => Promise<CrmDealPage>

/** Ce qu'une fiche compte montre au plus, les plus récents d'abord. */
const ACCOUNT_DEALS_SHOWN = 50
const ACCOUNT_ACTIVITIES_SHOWN = 50

const iso = (value: Date | string | null | undefined): string | null => {
  if (value == null) return null
  const ms = value instanceof Date ? value.getTime() : Date.parse(value)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}
const num = (value: string | number | null): number | null => {
  if (value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

type DealRow = {
  provider?: CrmMirrorSource
  external_id: string
  title: string | null
  amount: string | null
  currency: string | null
  stage_label: string | null
  stage_external_id: string | null
  pipeline_external_id: string | null
  status: 'open' | 'won' | 'lost' | null
  lost_reason: string | null
  expected_close_date: Date | null
  closed_at: Date | null
  crm_created_at: Date | null
  account_external_id: string | null
  company_name: string | null
  crm_updated_at: Date | null
  owner_external_id: string | null
  owner_name: string | null
  contact_external_ids: string[] | null
  crm_url: string | null
}

/** Le nom du propriétaire, par la table des propriétaires miroir (même espace, même CRM). */
const OWNER_JOIN = `LEFT JOIN crm_owners o
  ON o.workspace_id = d.workspace_id AND o.provider = d.provider AND o.external_id = d.owner_external_id`

/**
 * SYNC-A — les LECTEURS du miroir CRM. Le miroir d'abord ; l'appel direct au fournisseur en repli,
 * seulement si le miroir est VIDE pour ce fournisseur (`readDeals` rend alors `null`).
 *
 * Toute requête est bornée par l'espace (et le fournisseur, ou le compte) ; les fiches archivées
 * (disparues du CRM) ne se lisent pas.
 */
@Injectable()
export class CrmMirrorReader {
  constructor(@InjectRepository(CrmDealEntity) private readonly deals: Repository<CrmDealEntity>) {}

  private query<T>(sql: string, params: unknown[]): Promise<T> {
    return this.deals.manager.query(sql, params) as Promise<T>
  }

  /** Les affaires du miroir pour ce CRM, à la forme de `read.deals` ; `null` = miroir vide (repli). */
  async readDeals(workspaceId: string, provider: CrmProvider): Promise<MirrorDealsRead | null> {
    const [probe] = await this.query<Array<{ mirrored: boolean }>>(
      `SELECT EXISTS (SELECT 1 FROM crm_deals WHERE workspace_id = $1 AND provider = $2) AS mirrored`,
      [workspaceId, provider],
    )
    if (!probe?.mirrored) return null
    return async (_userId, opts) => {
      const limit = Math.min(Math.max(Math.trunc(opts.limit), 1), 500)
      const offset = opts.after?.startsWith('m:') ? Math.max(Number(opts.after.slice(2)) || 0, 0) : 0
      const rows = await this.query<DealRow[]>(
        `SELECT d.external_id, d.title, d.amount, d.currency, d.stage_label, d.stage_external_id,
                d.pipeline_external_id, d.status, d.lost_reason, d.expected_close_date, d.closed_at,
                d.crm_created_at, d.account_external_id, a.company_name, d.crm_updated_at,
                d.owner_external_id, o.name AS owner_name, d.contact_external_ids, d.crm_url
           FROM crm_deals d
           LEFT JOIN accounts a ON a.id = d.account_id AND a.workspace_id = d.workspace_id
           ${OWNER_JOIN}
          WHERE d.workspace_id = $1 AND d.provider = $2 AND d.archived_at IS NULL
            AND ($3::timestamptz IS NULL OR d.crm_updated_at IS NULL OR d.crm_updated_at > $3::timestamptz)
          ORDER BY d.crm_updated_at ASC NULLS FIRST, d.external_id
          LIMIT $4 OFFSET $5`,
        [workspaceId, provider, opts.since ?? null, limit, offset],
      )
      return {
        deals: rows.map(row => ({
          id: row.external_id,
          title: row.title,
          amount: num(row.amount),
          currency: row.currency,
          stage: row.stage_label,
          status: row.status,
          closeDate: iso(row.expected_close_date),
          closedAt: iso(row.closed_at),
          createdAt: iso(row.crm_created_at),
          accountId: row.account_external_id,
          accountName: row.company_name,
          modifiedAt: iso(row.crm_updated_at),
          ownerId: row.owner_external_id,
          pipelineId: row.pipeline_external_id,
          stageId: row.stage_external_id,
          lostReason: row.lost_reason,
          contactIds: row.contact_external_ids ?? [],
          url: row.crm_url,
        })),
        nextAfter: rows.length >= limit ? `m:${offset + rows.length}` : null,
      }
    }
  }

  /** La fiche compte : ses affaires et ses activités miroir, tous CRM branchés, les plus récentes d'abord. */
  async accountView(workspaceId: string, accountId: string): Promise<CrmMirrorAccountView> {
    const deals = await this.query<DealRow[]>(
      `SELECT d.provider, d.external_id, d.title, d.amount, d.currency, d.stage_label, d.status,
              d.expected_close_date, d.closed_at, o.name AS owner_name, d.crm_url
         FROM crm_deals d
         ${OWNER_JOIN}
        WHERE d.workspace_id = $1 AND d.account_id = $2 AND d.archived_at IS NULL
        ORDER BY COALESCE(d.closed_at, d.expected_close_date, d.crm_updated_at) DESC NULLS LAST
        LIMIT $3`,
      [workspaceId, accountId, ACCOUNT_DEALS_SHOWN],
    )
    const activities = await this.query<
      Array<{
        provider: CrmMirrorSource
        external_id: string
        kind: CrmMirrorAccountView['activities'][number]['kind']
        subject: string | null
        occurred_at: Date | null
        done: boolean | null
        owner_name: string | null
        crm_url: string | null
      }>
    >(
      `SELECT d.provider, d.external_id, d.kind, d.subject, d.occurred_at, d.done, o.name AS owner_name, d.crm_url
         FROM crm_activities d
         ${OWNER_JOIN}
        WHERE d.workspace_id = $1 AND d.account_id = $2 AND d.archived_at IS NULL
        ORDER BY d.occurred_at DESC NULLS LAST
        LIMIT $3`,
      [workspaceId, accountId, ACCOUNT_ACTIVITIES_SHOWN],
    )
    return {
      deals: deals.map(row => ({
        provider: row.provider ?? 'demo',
        id: row.external_id,
        title: row.title,
        amount: num(row.amount),
        currency: row.currency,
        stage: row.stage_label,
        status: row.status,
        expectedCloseDate: iso(row.expected_close_date),
        closedAt: iso(row.closed_at),
        ownerName: row.owner_name,
        url: row.crm_url,
      })),
      activities: activities.map(row => ({
        provider: row.provider,
        id: row.external_id,
        kind: row.kind,
        subject: row.subject,
        occurredAt: iso(row.occurred_at),
        done: row.done,
        ownerName: row.owner_name,
        url: row.crm_url,
      })),
    }
  }
}
