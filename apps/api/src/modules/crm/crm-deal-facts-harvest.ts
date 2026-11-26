import { CRM_DEAL_SIGNAL_PROVIDERS, type CrmProvider } from '@bellum/contracts'
import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CrmDealFactEntity } from '../../database/entities/crm-deal-fact.entity'
import { CrmMirrorReader } from '../crm-mirror/crm-mirror.reader'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CrmAdapterRegistry } from './adapter/crm-adapter.registry'
import type { CrmDealPage } from './adapter/crm-read-types'
import { CrmDealAccountLinker } from './crm-deal-account-linker'

/**
 * #3918.8 — Décision Louis 15/10/2026 : les affaires PIPEDRIVE et ODOO sont lues
 * comme celles des autres CRM → signaux et besoins, par les MÊMES règles
 * (`crm-deal-signal-rules.ts`, qui ne discriminent pas sur le fournisseur).
 *
 * Ce fichier ne fait qu'une chose : verser les affaires lues par l'adaptateur
 * commun (#4189, `read.deals`) dans le cache `crm_deal_facts`, que le balayeur
 * `CrmDealSignalsSweeper` relit déjà chaque matin. Ni règle ni seuil ici (GA-26).
 *
 * Rien n'est deviné :
 *  - `is_won` / `is_closed` ne viennent que du statut que le CRM REND
 *    (`won` / `lost` / `open`) — une affaire sans statut lisible n'entre pas ;
 *  - `closed_at` est la date de clôture RENDUE (jamais l'échéance prévue) ;
 *  - `last_activity_at` n'est pas lue : la règle de dormance le DIT
 *    (« depuis sa création ») plutôt que de prendre une modification pour une activité.
 */
// #3918.7 — Salesforce : lecture profonde des affaires (`read.deals`), mêmes règles que les autres.
export const DEAL_FACT_PROVIDERS = CRM_DEAL_SIGNAL_PROVIDERS

/** Pages lues par passage : la borne de volume (500 × 10), pas de qualité. */
const MAX_PAGES = 10
const PAGE_SIZE = 500

type DealRecord = CrmDealPage['deals'][number]
type DealFactRow = Pick<
  CrmDealFactEntity,
  | 'workspace_id'
  | 'provider'
  | 'deal_id'
  | 'name'
  | 'stage_label'
  | 'amount'
  | 'deal_created_at'
  | 'closed_at'
  | 'last_activity_at'
  | 'is_closed'
  | 'is_won'
  | 'company_external_id'
  | 'synced_at'
>

function dateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null
  const stamp = Date.parse(value)
  return Number.isFinite(stamp) ? new Date(stamp) : null
}

/** Une affaire lue → une ligne du cache, ou `null` quand son statut n'est pas lisible. */
export function toDealFactRow(
  workspaceId: string,
  provider: string,
  deal: DealRecord,
  syncedAt: Date,
): DealFactRow | null {
  if (!deal.id || deal.status === null) return null
  const closed = deal.status !== 'open'
  return {
    workspace_id: workspaceId,
    provider,
    deal_id: deal.id,
    name: deal.title,
    stage_label: deal.stage,
    amount: deal.amount === null ? null : String(deal.amount),
    deal_created_at: dateOrNull(deal.createdAt),
    // Une affaire ouverte n'a pas de clôture, quelle que soit la date que le CRM porterait.
    closed_at: closed ? dateOrNull(deal.closedAt) : null,
    last_activity_at: null,
    is_closed: closed,
    is_won: deal.status === 'won' ? true : deal.status === 'lost' ? false : null,
    company_external_id: deal.accountId,
    synced_at: syncedAt,
  }
}

@Injectable()
export class CrmDealFactsHarvester {
  private readonly logger = new Logger(CrmDealFactsHarvester.name)

  constructor(
    private readonly adapters: CrmAdapterRegistry,
    @InjectRepository(CrmDealFactEntity) private readonly facts: Repository<CrmDealFactEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    @Optional() private readonly dealAccounts?: CrmDealAccountLinker,
    // SYNC-A — le miroir CRM d'abord ; la lecture directe du fournisseur seulement si le miroir est vide.
    @Optional() private readonly mirror?: CrmMirrorReader,
  ) {}

  /** Verse les affaires d'un fournisseur ; rend le nombre de lignes écrites. No-op hors Pipedrive/Odoo/Salesforce. */
  async harvest(userId: string, provider: string): Promise<number> {
    if (!(DEAL_FACT_PROVIDERS as readonly string[]).includes(provider)) return 0
    const read = this.adapters.get(provider)?.read
    if (!read?.deals) return 0
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const readDeals = (await this.mirror?.readDeals(workspaceId, provider as CrmProvider)) ?? read.deals
    const syncedAt = new Date()
    let after: string | undefined
    let written = 0
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await readDeals(userId, { limit: PAGE_SIZE, ...(after ? { after } : {}) })
      const rows = result.deals
        .map(deal => toDealFactRow(workspaceId, provider, deal, syncedAt))
        .filter((row): row is DealFactRow => row !== null)
      if (rows.length > 0) await this.facts.upsert(rows, ['workspace_id', 'provider', 'deal_id'])
      written += rows.length
      if (!result.nextAfter) break
      after = result.nextAfter
    }
    try {
      await this.dealAccounts?.link(workspaceId)
    } catch (error) {
      this.logger.warn('Rattachement deal → compte en échec après lecture des affaires (non fatal)', {
        provider,
        error,
      })
    }
    return written
  }
}
