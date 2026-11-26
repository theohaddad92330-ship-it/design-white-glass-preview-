import { ConflictException } from '@nestjs/common'
import { OdooCallError, type OdooSaleOrder } from '../odoo/odoo.client'
import { odooClientForConnection } from '../odoo/odoo-connection'
import { MissionOdooSalesService } from './mission-odoo-sales.service'

/**
 * #2561/#2562 — les ventes Odoo dans /missions, et leur reprise en missions.
 * Lecture SEULE côté Odoo ; écriture côté Bellum par le geste ORDINAIRE de
 * création, derrière une prévisualisation FIGÉE.
 */

jest.mock('../odoo/odoo-connection', () => ({ odooClientForConnection: jest.fn() }))

const WORKSPACE = 'ws-1'

const SALE: OdooSaleOrder = {
  id: 42,
  reference: 'S00042',
  partnerName: 'SNCF',
  clientRef: null,
  orderDate: '2026-09-01',
  commitmentDate: '2026-09-15',
  state: 'sale',
  invoiceStatus: 'to invoice',
  amountUntaxed: 39600,
  currency: 'EUR',
  lines: [{ label: 'Data engineer — migration', quantity: 55, unitPrice: 720, subtotal: 39600 }],
}

function build(options: { connection?: object | null; sales?: OdooSaleOrder[]; error?: unknown } = {}) {
  const listConfirmedSaleOrders = jest.fn(async () => {
    if (options.error) throw options.error
    return options.sales ?? [SALE]
  })
  ;(odooClientForConnection as jest.Mock).mockReturnValue({ client: { listConfirmedSaleOrders }, uid: 7 })
  const connections = {
    findOne: jest.fn(async () =>
      options.connection === undefined ? { id: 'c-1', instance_url: 'https://x.odoo.com' } : options.connection,
    ),
    update: jest.fn(async () => undefined),
  }
  const accounts = { find: jest.fn(async () => [{ id: 'acc-sncf', company_name: 'SNCF', status: 'active' }]) }
  const missions = { find: jest.fn(async () => [] as unknown[]) }
  const delivery = { create: jest.fn(async () => ({ id: 'm-new' })) }
  const service = new MissionOdooSalesService(connections as never, accounts as never, missions as never)
  return { service, connections, accounts, missions, delivery, listConfirmedSaleOrders }
}

describe('MissionOdooSalesService.list', () => {
  it('« non connecté » sans instance branchée — et AUCUN appel à l’outil', async () => {
    const { service, listConfirmedSaleOrders } = build({ connection: null })
    await expect(service.list(WORKSPACE, false)).resolves.toEqual({ status: 'not_connected' })
    expect(listConfirmedSaleOrders).not.toHaveBeenCalled()
  })

  it('rend les ventes, avec leur correspondance et ce qui serait créé', async () => {
    const { service, connections } = build()
    const result = await service.list(WORKSPACE, false)
    expect(result).toMatchObject({
      status: 'ok',
      demo: false,
      sales: [
        { saleId: 42, reference: 'S00042', account: { id: 'acc-sncf' }, mission: null, draft: { dailyRate: 720 } },
      ],
    })
    // Dernier usage RÉEL du lien : posé APRÈS une lecture réussie.
    expect(connections.update).toHaveBeenCalledWith('c-1', { last_used_at: expect.any(Date) })
  })

  it('un DÉLAI dépassé rend `unknown` — jamais une liste vide, jamais une erreur sèche', async () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
    const { service, connections } = build({ error: timeout })
    await expect(service.list(WORKSPACE, false)).resolves.toMatchObject({ status: 'unknown' })
    expect(connections.update).not.toHaveBeenCalled()
  })

  it('un refus de l’outil rend `error` avec SON message — jamais de donnée inventée', async () => {
    const { service } = build({ error: new OdooCallError('Accès refusé au modèle sale.order', 'rpc') })
    await expect(service.list(WORKSPACE, false)).resolves.toEqual({
      status: 'error',
      message: 'Accès refusé au modèle sale.order',
    })
  })

  it('en DÉMONSTRATION, sert les ventes fictives de la salle sans lire aucune connexion', async () => {
    const { service, connections } = build()
    const result = await service.list(WORKSPACE, true)
    expect(connections.findOne).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'ok', demo: true })
  })
})

describe('MissionOdooSalesService — prévisualisation figée puis reprise', () => {
  it('prévisualise EXACTEMENT ce qui sera créé, avec une empreinte', async () => {
    const { service } = build()
    const preview = await service.preview(WORKSPACE, false, [42, 999])
    expect(preview).toMatchObject({
      status: 'ok',
      items: [{ saleId: 42, accountId: 'acc-sncf', label: 'Data engineer — migration (S00042)', dailyRate: 720 }],
      skipped: [{ saleId: 999, reason: 'not_found' }],
    })
    expect(preview.status === 'ok' && preview.fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it('crée par le geste ORDINAIRE, la vente en origine — jamais d’écriture chez l’outil', async () => {
    const { service, delivery, listConfirmedSaleOrders } = build()
    const preview = await service.preview(WORKSPACE, false, [42])
    const fingerprint = preview.status === 'ok' ? preview.fingerprint : ''
    const result = await service.importSales(WORKSPACE, false, [42], fingerprint, delivery.create)
    expect(delivery.create).toHaveBeenCalledWith(
      { accountId: 'acc-sncf', label: 'Data engineer — migration (S00042)', startedOn: '2026-09-15', dailyRate: 720 },
      { odooSaleOrderId: 42 },
    )
    expect(result).toEqual({ status: 'ok', created: [{ saleId: 42, missionId: 'm-new' }], failed: [] })
    // La création RELIT l'outil (prévisualisation, puis relecture) : l'empreinte
    // se compare à l'état COURANT, pas à un cache.
    expect(listConfirmedSaleOrders).toHaveBeenCalledTimes(2)
  })

  it('REFUSE de créer si la vente a changé depuis la prévisualisation', async () => {
    const { service, delivery } = build()
    await expect(service.importSales(WORKSPACE, false, [42], 'empreinte-perimee', delivery.create)).rejects.toThrow(
      ConflictException,
    )
    expect(delivery.create).not.toHaveBeenCalled()
  })

  it('ne recrée RIEN au second passage : la vente déjà reprise sort de la prévisualisation', async () => {
    const { service, missions, delivery } = build()
    missions.find.mockResolvedValue([
      {
        id: 'm-1',
        label: 'Data (S00042)',
        account_id: 'acc-sncf',
        started_on: null,
        daily_rate: null,
        odoo_sale_order_id: 42,
      },
    ])
    const preview = await service.preview(WORKSPACE, false, [42])
    expect(preview).toMatchObject({ items: [], skipped: [{ saleId: 42, reason: 'already_mission' }] })
    const fingerprint = preview.status === 'ok' ? preview.fingerprint : ''
    await service.importSales(WORKSPACE, false, [42], fingerprint, delivery.create)
    expect(delivery.create).not.toHaveBeenCalled()
  })

  it('une course perdue contre l’index unique se lit comme « déjà reprise », pas comme une panne', async () => {
    const { service, delivery } = build()
    delivery.create.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }))
    const preview = await service.preview(WORKSPACE, false, [42])
    const fingerprint = preview.status === 'ok' ? preview.fingerprint : ''
    await expect(service.importSales(WORKSPACE, false, [42], fingerprint, delivery.create)).resolves.toEqual({
      status: 'ok',
      created: [],
      failed: [{ saleId: 42, reason: 'already_mission' }],
    })
  })
})
