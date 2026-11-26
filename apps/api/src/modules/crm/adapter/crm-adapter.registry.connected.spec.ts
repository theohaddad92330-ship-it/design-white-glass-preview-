import { CRM_PROVIDERS } from '@bellum/contracts'
import type { Repository } from 'typeorm'
import type { CrmConnectionEntity } from '../../../database/entities/crm-connection.entity'
import type { WorkspaceContextService } from '../../workspace/workspace-context.service'
import type { AttioService } from '../../attio/attio.service'
import type { OdooService } from '../../odoo/odoo.service'
import type { PipedriveService } from '../../pipedrive/pipedrive.service'
import type { SalesforceService } from '../../salesforce/salesforce.service'
import type { ZohoService } from '../../zoho/zoho.service'
import type { CrmDepthService } from '../crm-depth.service'
import type { CrmService } from '../crm.service'
import { CrmAdapterRegistry } from './crm-adapter.registry'

/**
 * #4450 — GET /crm/write-requests lisait `crm_connections` UNE FOIS PAR
 * FOURNISSEUR (six `findOne` identiques au fournisseur près : le N+1 que
 * Sentry relève). Les liaisons de l'espace se lisent désormais en UNE requête ;
 * seul un fournisseur effectivement lié est interrogé pour son libellé.
 */
describe('CrmAdapterRegistry.connected — une requête pour les liaisons (#4450)', () => {
  function build(linked: string[]) {
    const statusCalls: string[] = []
    const service = (provider: string) => ({
      getStatus: jest.fn(async () => {
        statusCalls.push(provider)
        return linked.includes(provider)
          ? { connected: true, accountLabel: `Espace ${provider}` }
          : { connected: false }
      }),
    })
    const find = jest.fn(async () => linked.map(provider => ({ provider })))
    const workspace = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'ws-1', role: 'owner' })) }
    const registry = new CrmAdapterRegistry(
      service('hubspot') as unknown as CrmService,
      {} as CrmDepthService,
      service('salesforce') as unknown as SalesforceService,
      service('pipedrive') as unknown as PipedriveService,
      service('attio') as unknown as AttioService,
      service('odoo') as unknown as OdooService,
      service('zoho') as unknown as ZohoService,
      { find } as unknown as Repository<CrmConnectionEntity>,
      workspace as unknown as WorkspaceContextService,
    )
    return { registry, statusCalls, find }
  }

  it('lit les liaisons en UNE requête et n’interroge que le fournisseur lié', async () => {
    const { registry, statusCalls, find } = build(['pipedrive'])
    const connected = await registry.connected('user-1')
    expect(find).toHaveBeenCalledTimes(1)
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { workspace_id: 'ws-1' } }))
    expect(statusCalls).toEqual(['pipedrive'])
    expect(connected.map(row => [row.adapter.provider, row.accountLabel])).toEqual([['pipedrive', 'Espace pipedrive']])
  })

  it('aucune liaison ⇒ aucun appel de statut, liste vide', async () => {
    const { registry, statusCalls } = build([])
    expect(await registry.connected('user-1')).toEqual([])
    expect(statusCalls).toEqual([])
  })

  it('garde l’ordre du contrat quand plusieurs CRM sont liés', async () => {
    const { registry } = build(['zoho', 'hubspot'])
    const providers = (await registry.connected('user-1')).map(row => row.adapter.provider)
    expect(providers).toEqual(CRM_PROVIDERS.filter(p => p === 'zoho' || p === 'hubspot'))
  })
})
