import { MODULE_METADATA } from '@nestjs/common/constants'
import { CopilotBridgeModule } from './copilot-bridge.module'
import { CopilotCrmDealsController } from './copilot-crm-deals.controller'

// #4065.8 — Laura liste les affaires gagnées / perdues du CRM branché, par le pont CRM.
const USER = '11111111-1111-4111-8111-111111111111'

const deal = (over: Record<string, unknown>) => ({
  id: '1',
  title: 'Migration cloud',
  amount: 90000,
  currency: null,
  stage: 'Closed Lost',
  status: 'lost',
  closeDate: '2026-04-01',
  closedAt: '2026-04-01',
  createdAt: null,
  accountId: 'a1',
  accountName: 'ACME',
  contactName: 'Jeanne Martin',
  modifiedAt: null,
  ...over,
})

function build(opts: { connected?: boolean; pages?: unknown[]; allowed?: boolean; hasDeals?: boolean } = {}) {
  const pages = [...(opts.pages ?? [{ deals: [deal({})], nextAfter: null }])]
  const deals = jest.fn().mockImplementation(async () => pages.shift())
  const registry = {
    firstConnected: jest.fn().mockImplementation(async (_u: string, accepts: (a: unknown) => boolean) => {
      if (opts.connected === false) return null
      const adapter = opts.hasDeals === false ? { read: {} } : { read: { deals } }
      return accepts(adapter) ? { adapter, accountLabel: null } : null
    }),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest
      .fn()
      .mockResolvedValue({ workspaceId: 'w1', role: opts.allowed === false ? 'viewer' : 'member' }),
    extraPermissionsOf: jest.fn().mockResolvedValue([]),
  }
  return { controller: new CopilotCrmDealsController(registry as never, workspaceContext as never), deals, registry }
}

describe('CopilotCrmDealsController — #4065.8', () => {
  it('rend les affaires PERDUES avec leur interlocuteur, sans nommer l’éditeur', async () => {
    const { controller } = build({
      pages: [{ deals: [deal({}), deal({ id: '2', status: 'won', title: 'TMA' })], nextAfter: null }],
    })
    const out = await controller.deals({ userId: USER, outcome: 'lost' })
    expect(out).toMatchObject({
      connected: true,
      complete: true,
      deals: [{ title: 'Migration cloud', contactName: 'Jeanne Martin', status: 'lost' }],
    })
    expect(JSON.stringify(out)).not.toMatch(/salesforce|hubspot|pipedrive|odoo|attio|zoho/i)
  })

  it('« closed » garde gagnées ET perdues, jamais les ouvertes ni les statuts illisibles', async () => {
    const { controller } = build({
      pages: [
        {
          deals: [
            deal({}),
            deal({ id: '2', status: 'won' }),
            deal({ id: '3', status: 'open' }),
            deal({ id: '4', status: null }),
          ],
          nextAfter: null,
        },
      ],
    })
    const out = (await controller.deals({ userId: USER, outcome: 'closed' })) as { deals: { id: string }[] }
    expect(out.deals.map(d => d.id)).toEqual(['1', '2'])
  })

  it('lit page après page jusqu’à la borne et DIT quand la lecture est incomplète', async () => {
    const { controller, deals } = build({
      pages: Array.from({ length: 12 }, (_, i) => ({ deals: [deal({ id: String(i) })], nextAfter: `p${i + 1}` })),
    })
    const out = (await controller.deals({ userId: USER, outcome: 'lost' })) as { complete: boolean; dealsRead: number }
    expect(out.complete).toBe(false)
    expect(deals.mock.calls.length).toBeLessThan(12)
    expect(out.dealsRead).toBeGreaterThan(0)
  })

  it('sait dire NON : pas de CRM branché = `connected: false` ; CRM sans lecture d’affaires ; droit manquant', async () => {
    await expect(build({ connected: false }).controller.deals({ userId: USER, outcome: 'lost' })).resolves.toEqual({
      connected: false,
      deals: [],
    })
    await expect(build({ hasDeals: false }).controller.deals({ userId: USER, outcome: 'lost' })).resolves.toMatchObject(
      {
        connected: false,
      },
    )
    await expect(build({ allowed: false }).controller.deals({ userId: USER, outcome: 'lost' })).resolves.toEqual({
      error: 'crm_read_forbidden',
    })
  })

  it('une lecture qui échoue est un ERREUR nommée, jamais une liste vide', async () => {
    const { controller, deals } = build()
    deals.mockRejectedValueOnce(new Error("HubSpot read deals failed: hasn't been granted"))
    await expect(controller.deals({ userId: USER, outcome: 'lost' })).resolves.toEqual({ error: 'crm_read_failed' })
  })

  it('est branché sur le pont', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, CopilotBridgeModule)).toContain(CopilotCrmDealsController)
  })
})
