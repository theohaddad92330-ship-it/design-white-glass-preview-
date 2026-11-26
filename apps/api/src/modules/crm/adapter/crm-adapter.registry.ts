import { Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { CRM_PROVIDERS, type CrmProvider } from '@bellum/contracts'
import type { Repository } from 'typeorm'
import { CrmConnectionEntity } from '../../../database/entities/crm-connection.entity'
import { AttioService } from '../../attio/attio.service'
import { OdooService } from '../../odoo/odoo.service'
import { PipedriveService } from '../../pipedrive/pipedrive.service'
import { SalesforceService } from '../../salesforce/salesforce.service'
import { WorkspaceContextService } from '../../workspace/workspace-context.service'
import { workspaceScopeWhere } from '../../workspace/workspace-scoping'
import { ZohoService } from '../../zoho/zoho.service'
import { CrmDepthService } from '../crm-depth.service'
import { CrmService } from '../crm.service'
import { adapterFor, buildCrmAdapters, type CrmAdapter } from './crm-adapter'

/**
 * #4185 — le REGISTRE des adaptateurs CRM, injectable.
 *
 * Le routeur d'actions, l'export de besoin et l'envoi de comptes lisent ICI
 * quel CRM est branché et ce qu'il sait faire — plus aucun switch par
 * fournisseur ailleurs (garde `crm-adapter.registry.spec.ts`).
 */
@Injectable()
export class CrmAdapterRegistry {
  private readonly adapters: Readonly<Record<CrmProvider, CrmAdapter>>

  constructor(
    hubspot: CrmService,
    hubspotDepth: CrmDepthService,
    salesforce: SalesforceService,
    pipedrive: PipedriveService,
    attio: AttioService,
    odoo: OdooService,
    zoho: ZohoService,
    // #4450 — optionnels : sans eux (tests unitaires), chaque `status` se lit comme avant.
    @Optional()
    @InjectRepository(CrmConnectionEntity)
    private readonly connections?: Repository<CrmConnectionEntity>,
    @Optional() private readonly workspace?: WorkspaceContextService,
  ) {
    this.adapters = buildCrmAdapters({ hubspot, hubspotDepth, salesforce, pipedrive, attio, odoo, zoho })
  }

  /** L'adaptateur d'un fournisseur ; `null` = fournisseur inconnu du contrat. */
  get(provider: string): CrmAdapter | null {
    return adapterFor(this.adapters, provider)
  }

  /**
   * Le PREMIER CRM branché (ordre du contrat) qui répond au critère, ou `null`.
   * S'arrête au premier : un fournisseur plus bas dans l'ordre n'est pas lu.
   */
  async firstConnected(
    userId: string,
    accepts: (adapter: CrmAdapter) => boolean,
  ): Promise<{ adapter: CrmAdapter; accountLabel: string | null } | null> {
    for (const provider of CRM_PROVIDERS) {
      const adapter = this.adapters[provider]
      if (!accepts(adapter)) continue
      const status = await adapter.status(userId)
      if (status.connected) return { adapter, accountLabel: status.accountLabel ?? null }
    }
    return null
  }

  /**
   * Les CRM BRANCHÉS de l'espace, dans l'ordre du contrat (l'ordre du
   * sélecteur). Chaque `status` est un no-op strict (zéro réseau) quand son
   * fournisseur n'est pas configuré.
   */
  async connected(userId: string): Promise<Array<{ adapter: CrmAdapter; accountLabel: string | null }>> {
    const out: Array<{ adapter: CrmAdapter; accountLabel: string | null }> = []
    const linked = await this.linkedProviders(userId)
    for (const provider of CRM_PROVIDERS) {
      // #4450 — un fournisseur sans liaison dans l'espace n'est pas « branché » :
      // inutile de relire `crm_connections` pour lui (le N+1 de /crm/write-requests).
      if (linked && !linked.has(provider)) continue
      const adapter = this.adapters[provider]
      const status = await adapter.status(userId)
      if (status.connected) out.push({ adapter, accountLabel: status.accountLabel ?? null })
    }
    return out
  }

  /**
   * #4450 — les fournisseurs LIÉS à l'espace, en UNE requête. `null` = on ne
   * sait pas (dépendances absentes, lecture en échec) : l'appelant retombe
   * alors sur le statut de chaque fournisseur, jamais sur « rien de branché ».
   */
  private async linkedProviders(userId: string): Promise<Set<string> | null> {
    if (!this.connections || !this.workspace) return null
    try {
      const { workspaceId } = await this.workspace.resolveActiveWorkspace(userId)
      const rows = await this.connections.find({ where: workspaceScopeWhere(workspaceId), select: { provider: true } })
      return new Set(rows.map(row => row.provider))
    } catch {
      return null
    }
  }
}
