import type { Repository } from 'typeorm'
import type { CrmDealFactEntity } from '../../database/entities/crm-deal-fact.entity'
import type { CrmAdapterRegistry } from './adapter/crm-adapter.registry'
import type { CrmDealPage } from './adapter/crm-read-types'
import { CrmDealFactsHarvester, toDealFactRow } from './crm-deal-facts-harvest'
import { detectDealsForRenewal, detectDormantDeals, detectLostDeals } from './crm-deal-signal-rules'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'

type Deal = CrmDealPage['deals'][number]
const deal = (overrides: Partial<Deal>): Deal => ({
  id: '1',
  title: 'Régie',
  amount: 90000,
  currency: 'EUR',
  stage: null,
  status: 'open',
  closeDate: null,
  accountId: '12',
  accountName: null,
  modifiedAt: null,
  ...overrides,
})
const NOW = new Date('2026-10-15T00:00:00Z')

// #3918.8 (Louis 15/10/2026) — affaires Pipedrive et Odoo lues comme les autres CRM → mêmes règles.
describe('#3918.8 — une affaire Pipedrive / Odoo devient une ligne du cache que lisent les règles', () => {
  it('perdue, gagnée, ouverte : le statut rendu par le CRM, la clôture réelle — et les MÊMES règles s’en saisissent', () => {
    const lost = toDealFactRow(
      'w',
      'pipedrive',
      deal({ id: 'L', status: 'lost', closedAt: '2025-12-01T00:00:00Z' }),
      NOW,
    )
    const won = toDealFactRow('w', 'odoo', deal({ id: 'W', status: 'won', closedAt: '2025-06-01T00:00:00Z' }), NOW)
    const open = toDealFactRow('w', 'pipedrive', deal({ id: 'O', createdAt: '2026-01-01T00:00:00Z' }), NOW)
    expect([lost?.is_closed, lost?.is_won, won?.is_won, open?.is_closed, open?.is_won]).toEqual([
      true,
      false,
      true,
      false,
      null,
    ])
    const rows = [lost, won, open].map(row => ({ ...row!, id: row!.deal_id, amount: row!.amount }))
    expect(detectLostDeals(rows, NOW).map(d => d.dealFactId)).toEqual(['L'])
    expect(detectDealsForRenewal(rows, NOW).map(d => d.dealFactId)).toEqual(['W'])
    expect(detectDormantDeals(rows, NOW).map(d => d.dealFactId)).toEqual(['O'])
  })

  it('sait dire NON — un statut illisible n’entre pas ; une affaire ouverte n’a pas de clôture ; l’échéance prévue n’est jamais une clôture', () => {
    expect(toDealFactRow('w', 'pipedrive', deal({ status: null }), NOW)).toBeNull()
    const open = toDealFactRow(
      'w',
      'pipedrive',
      deal({ closedAt: '2025-01-01T00:00:00Z', closeDate: '2025-01-01' }),
      NOW,
    )
    expect(open?.closed_at).toBeNull()
    const lostNoDate = toDealFactRow('w', 'pipedrive', deal({ status: 'lost', closeDate: '2025-01-01' }), NOW)
    expect(lostNoDate?.closed_at).toBeNull()
  })

  it('verse les affaires de Pipedrive et d’Odoo, page par page — et rien pour un autre fournisseur', async () => {
    const deals = jest
      .fn()
      .mockResolvedValueOnce({ deals: [deal({ id: 'a' })], nextAfter: 'p2' })
      .mockResolvedValueOnce({ deals: [deal({ id: 'b', status: 'won' })], nextAfter: null })
    const upsert = jest.fn()
    const link = jest.fn()
    const harvester = new CrmDealFactsHarvester(
      { get: () => ({ read: { deals } }) } as unknown as CrmAdapterRegistry,
      { upsert } as unknown as Repository<CrmDealFactEntity>,
      { resolveActiveWorkspace: async () => ({ workspaceId: 'w-1' }) } as unknown as WorkspaceContextService,
      { link } as never,
    )
    expect(await harvester.harvest('u-1', 'pipedrive')).toBe(2)
    expect(deals.mock.calls[1]?.[1]).toEqual({ limit: 500, after: 'p2' })
    expect(upsert.mock.calls.map(c => (c[0] as { deal_id: string }[])[0]?.deal_id)).toEqual(['a', 'b'])
    expect(link).toHaveBeenCalledWith('w-1')
    expect(await harvester.harvest('u-1', 'hubspot')).toBe(0)
  })

  // #3918.7 — Salesforce rejoint Pipedrive et Odoo : même cache, mêmes règles.
  it('#3918.7 — verse aussi les affaires de Salesforce ; un fournisseur sans lecture d’affaires reste à 0', async () => {
    const deals = jest
      .fn()
      .mockResolvedValueOnce({ deals: [deal({ id: 'sf1', status: 'lost', closedAt: '2026-04-01' })], nextAfter: null })
    const upsert = jest.fn()
    const harvester = new CrmDealFactsHarvester(
      { get: () => ({ read: { deals } }) } as unknown as CrmAdapterRegistry,
      { upsert } as unknown as Repository<CrmDealFactEntity>,
      { resolveActiveWorkspace: async () => ({ workspaceId: 'w-1' }) } as unknown as WorkspaceContextService,
    )
    expect(await harvester.harvest('u-1', 'salesforce')).toBe(1)
    expect((upsert.mock.calls[0]?.[0] as { provider: string }[])[0]?.provider).toBe('salesforce')
    expect(await harvester.harvest('u-1', 'attio')).toBe(0)
  })
})

// SYNC-A — la récolte des affaires de veille lit le MIROIR CRM d'abord, le fournisseur en repli.
describe('CrmDealFactsHarvester — le miroir d’abord (SYNC-A A.5)', () => {
  function harvester(mirrorDeals: Deal[] | null) {
    const direct = jest.fn(async () => ({ deals: [deal({ id: 'direct', status: 'lost' })], nextAfter: null }))
    const upsert = jest.fn(async () => undefined)
    const adapters = { get: () => ({ read: { deals: direct } }) } as unknown as CrmAdapterRegistry
    const facts = { upsert } as unknown as Repository<CrmDealFactEntity>
    const workspace = {
      resolveActiveWorkspace: async () => ({ workspaceId: 'w' }),
    } as unknown as WorkspaceContextService
    const mirror = {
      readDeals: async () => (mirrorDeals ? async () => ({ deals: mirrorDeals, nextAfter: null }) : null),
    }
    return {
      direct,
      upsert,
      service: new CrmDealFactsHarvester(adapters, facts, workspace, undefined, mirror as never),
    }
  }

  it('miroir rempli : aucune lecture directe du fournisseur', async () => {
    const { direct, upsert, service } = harvester([deal({ id: 'miroir', status: 'won' })])
    expect(await service.harvest('u', 'pipedrive')).toBe(1)
    expect(direct).not.toHaveBeenCalled()
    expect((upsert.mock.calls[0] as unknown as [Array<{ deal_id: string }>])[0][0]?.deal_id).toBe('miroir')
  })

  it('miroir vide pour ce CRM : repli sur la lecture directe', async () => {
    const { direct, service } = harvester(null)
    expect(await service.harvest('u', 'pipedrive')).toBe(1)
    expect(direct).toHaveBeenCalled()
  })
})
