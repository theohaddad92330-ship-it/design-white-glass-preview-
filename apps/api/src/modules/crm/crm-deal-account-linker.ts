import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { CrmDealAccountLinkBasis } from '@bellum/contracts'
import { CrmDealFactEntity } from '../../database/entities/crm-deal-fact.entity'
import { resolveDealAccount, type DealAccountCandidate, type DealCompanyKeys } from './crm-deal-account-link'

type LinkableDeal = DealCompanyKeys & {
  id: string
  workspace_id: string
  provider: string
  account_id: string | null
  account_link_basis: CrmDealAccountLinkBasis | null
}

type CompanyLinkRow = { workspace_id: string; provider: string; external_id: string; internal_id: string }
type AccountRow = DealAccountCandidate & { workspace_id: string }

/**
 * #3918.a (lot M01, 09/10/2026) — pose `crm_deal_facts.account_id` d'après
 * les seules clés que la règle pure accepte (`resolveDealAccount` : id société
 * du fournisseur, puis SIREN, puis domaine — jamais le nom).
 *
 * Appelé par `CrmDealSignalsSweeper` avant ses règles (tout le parc réel, une
 * fois par jour) et par `CrmDepthService.syncPipeline` juste après une
 * relecture (l'espace concerné seulement). Chaque espace ne voit QUE ses
 * comptes et ses liens : un SIREN identique dans un autre espace ne rattache
 * jamais (deux ESN concurrentes peuvent suivre la même société).
 *
 * N'écrit que ce qui change — et délie un deal dont la clé ne joint plus
 * (compte supprimé, SIREN corrigé) plutôt que de garder un lien périmé.
 */
@Injectable()
export class CrmDealAccountLinker {
  private readonly logger = new Logger(CrmDealAccountLinker.name)

  constructor(
    @InjectRepository(CrmDealFactEntity)
    private readonly facts: Repository<CrmDealFactEntity>,
  ) {}

  /** Rend le nombre de deals RATTACHÉS à l'issue du passage. */
  async link(workspaceId?: string): Promise<number> {
    const manager = this.facts.manager
    const deals = await manager.query<LinkableDeal[]>(
      `SELECT f.id, f.workspace_id, f.provider, f.name, f.company_external_id, f.company_siren,
              f.company_domain, f.company_name AS company_label, f.account_id, f.account_link_basis
         FROM crm_deal_facts f
         JOIN workspaces w ON w.id = f.workspace_id AND w.is_demo = false
        ${workspaceId ? 'WHERE f.workspace_id = $1' : ''}
        LIMIT 5000`,
      workspaceId ? [workspaceId] : [],
    )
    if (deals.length === 0) return 0
    const workspaceIds = [...new Set(deals.map(d => d.workspace_id))]

    const [links, accounts] = await Promise.all([
      manager.query<CompanyLinkRow[]>(
        `SELECT workspace_id, provider, external_id, internal_id
           FROM sync_links
          WHERE entity_type = 'account' AND workspace_id = ANY($1::uuid[])`,
        [workspaceIds],
      ),
      manager.query<AccountRow[]>(
        `SELECT id, workspace_id, company_name, siren, website
           FROM accounts
          WHERE workspace_id = ANY($1::uuid[]) AND status <> 'deleted'`,
        [workspaceIds],
      ),
    ])

    let linked = 0
    for (const deal of deals) {
      const companyLinks = new Map(
        links
          .filter(l => l.workspace_id === deal.workspace_id && l.provider === deal.provider)
          .map(l => [l.external_id, l.internal_id] as const),
      )
      const candidates = accounts.filter(a => a.workspace_id === deal.workspace_id)
      const link = resolveDealAccount(deal, { companyLinks, accounts: candidates })
      if (link) linked += 1
      const accountId = link?.accountId ?? null
      const basis = link?.basis ?? null
      if (accountId === deal.account_id && basis === deal.account_link_basis) continue
      try {
        await manager.query(`UPDATE crm_deal_facts SET account_id = $2, account_link_basis = $3 WHERE id = $1`, [
          deal.id,
          accountId,
          basis,
        ])
      } catch (error) {
        this.logger.warn('Rattachement deal → compte non écrit (non fatal)', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return linked
  }
}
