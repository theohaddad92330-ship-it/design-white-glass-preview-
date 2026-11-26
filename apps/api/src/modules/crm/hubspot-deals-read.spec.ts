import { CopilotCrmDealsController } from '../copilot-bridge/copilot-crm-deals.controller'
import type { CrmAdapterRegistry } from './adapter/crm-adapter.registry'
import { buildCrmAdapters, type CrmAdapterDeps } from './adapter/crm-adapter'
import { HubspotClient, toDealRead } from './hubspot.client'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'

/**
 * HUBSPOT-J.4 — « liste mes affaires perdues en 2026 » : le chemin complet, de l'outil du copilote
 * jusqu'à l'API HubSpot (mockée). Avant : l'adaptateur HubSpot n'avait pas de `read.deals`, donc
 * `connected: false` → « ton CRM n'est pas disponible pour cette lecture ».
 */
const USER = '11111111-1111-4111-8111-111111111111'

const row = (id: string, props: Record<string, string>) => ({ id, properties: props })

describe('toDealRead (J.4)', () => {
  it('affaire perdue : closedlost ou hs_is_closed sans gain', () => {
    expect(toDealRead(row('1', { dealstage: 'closedlost', hs_is_closed: 'true' })).status).toBe('lost')
    expect(toDealRead(row('2', { dealstage: '9876', hs_is_closed: 'true', hs_is_closed_won: 'false' })).status).toBe(
      'lost',
    )
  })
  it('gagnée, ouverte, inconnue — jamais devinée', () => {
    expect(toDealRead(row('3', { dealstage: 'closedwon', hs_is_closed_won: 'true' })).status).toBe('won')
    expect(toDealRead(row('4', { dealstage: 'appointmentscheduled', hs_is_closed: 'false' })).status).toBe('open')
    expect(toDealRead(row('5', { dealstage: 'x' })).status).toBeNull()
  })
  it('montant absent → null, jamais 0', () => {
    expect(toDealRead(row('6', {})).amount).toBeNull()
    expect(toDealRead(row('7', { amount: '1200.5' })).amount).toBe(1200.5)
  })
})

describe('copilot crm/deals sur HubSpot (J.4)', () => {
  const originalFetch = global.fetch
  afterEach(() => {
    global.fetch = originalFetch
  })

  function controller() {
    const client = new HubspotClient({ clientId: 'c', clientSecret: 's', redirectUri: 'r', scopes: [] } as never)
    const other = { getStatus: async () => ({ connected: false }) }
    const deps = {
      salesforce: other,
      pipedrive: other,
      attio: other,
      zoho: other,
      odoo: other,
      hubspotDepth: {},
      hubspot: {
        getStatus: async () => ({ connected: true }),
        listDeals: (_u: string, opts: { limit: number; after?: string }) => client.listDeals('tok', opts),
      },
    } as unknown as CrmAdapterDeps
    const adapter = buildCrmAdapters(deps).hubspot
    const adapters = { firstConnected: async () => ({ adapter }) } as unknown as CrmAdapterRegistry
    const workspace = {
      resolveActiveWorkspace: async () => ({ workspaceId: 'w', role: 'owner' }),
      extraPermissionsOf: async () => [],
    } as unknown as WorkspaceContextService
    return new CopilotCrmDealsController(adapters, workspace)
  }

  it('rend les affaires perdues, pas les gagnées ni les ouvertes', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [
          row('1', { dealname: 'Refonte SI', dealstage: 'closedlost', hs_is_closed: 'true', amount: '50000' }),
          row('2', { dealname: 'TMA', dealstage: 'closedwon', hs_is_closed_won: 'true', hs_is_closed: 'true' }),
          row('3', { dealname: 'En cours', dealstage: 'qualified', hs_is_closed: 'false' }),
        ],
      }),
    })) as never
    const result = await controller().deals({ userId: USER, outcome: 'lost' } as never)
    expect(result).toMatchObject({ connected: true, complete: true, dealsRead: 3 })
    expect((result as { deals: Array<{ id: string; status: string }> }).deals).toEqual([
      expect.objectContaining({ id: '1', title: 'Refonte SI', status: 'lost', amount: 50000 }),
    ])
  })
})

// SYNC-A — Laura lit les affaires du MIROIR d'abord ; le fournisseur seulement si le miroir est vide.
describe('copilot.crm_deals — le miroir d’abord (SYNC-A A.5)', () => {
  it('miroir rempli : les affaires du miroir, aucune lecture HubSpot', async () => {
    const direct = jest.fn()
    const adapter = { provider: 'hubspot', read: { deals: direct } }
    const adapters = { firstConnected: async () => ({ adapter }) } as unknown as CrmAdapterRegistry
    const workspace = {
      resolveActiveWorkspace: async () => ({ workspaceId: 'w', role: 'owner' }),
      extraPermissionsOf: async () => [],
    } as unknown as WorkspaceContextService
    const mirror = {
      readDeals: async () => async () => ({
        deals: [{ ...toDealRead(row('m1', { dealname: 'Miroir', dealstage: 'closedlost' })) }],
        nextAfter: null,
      }),
    }
    const result = await new CopilotCrmDealsController(adapters, workspace, mirror as never).deals({
      userId: USER,
      outcome: 'lost',
    } as never)
    expect(direct).not.toHaveBeenCalled()
    expect((result as { deals: Array<{ id: string }> }).deals.map(d => d.id)).toEqual(['m1'])
  })
})
