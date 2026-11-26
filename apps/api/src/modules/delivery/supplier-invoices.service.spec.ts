import { NotFoundException } from '@nestjs/common'
import { SupplierInvoicesService } from './supplier-invoices.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const MISSION = 'm0000000-0000-4000-8000-000000000001'
const INVOICE = 'i0000000-0000-4000-8000-000000000001'

function makeService(overrides: Record<string, unknown> = {}) {
  const manager = {
    query: jest.fn(async () => [{ total: (overrides['totalCents'] as string) ?? '0' }]),
  }
  const existingRow = (overrides['existing'] as Record<string, unknown>) ?? {
    id: INVOICE,
    mission_id: MISSION,
    workspace_id: WORKSPACE,
    reference: 'FA-2026-118',
    amount_cents: 45_000,
    invoice_date: '2026-08-15',
    status: 'pending',
    entered_by: USER,
    source: 'human',
    created_at: new Date('2026-08-15T09:00:00.000Z'),
    updated_at: new Date('2026-08-15T09:00:00.000Z'),
  }
  const invoices = {
    manager,
    find: jest.fn(async () => (overrides['rows'] as unknown[]) ?? [existingRow]),
    findOne: jest.fn(async () => (overrides['findOneMissing'] === true ? null : existingRow)),
    create: jest.fn((e: Record<string, unknown>) => ({ id: 'new-invoice', ...e })),
    save: jest.fn(async (e: Record<string, unknown>) => ({
      created_at: new Date('2026-08-20T09:00:00.000Z'),
      updated_at: new Date('2026-08-20T09:00:00.000Z'),
      status: 'pending',
      ...e,
    })),
    update: jest.fn(async () => ({ affected: 1 })),
  }
  const missions = {
    findOne: jest.fn(async () =>
      overrides['missionMissing'] === true ? null : { id: MISSION, workspace_id: WORKSPACE },
    ),
  }

  const service = new SupplierInvoicesService(invoices as never, missions as never)
  return { service, invoices, missions }
}

describe('SupplierInvoicesService.list', () => {
  it('refuse une mission hors de l’espace', async () => {
    const { service } = makeService({ missionMissing: true })
    await expect(service.list(WORKSPACE, MISSION)).rejects.toThrow(NotFoundException)
  })

  it('rend les factures de la mission', async () => {
    const { service } = makeService()
    const items = await service.list(WORKSPACE, MISSION)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ reference: 'FA-2026-118', amountCents: 45_000, status: 'pending' })
  })
})

describe('SupplierInvoicesService.totalCents', () => {
  it('rend 0 sur une mission sans facture', async () => {
    const { service } = makeService({ totalCents: '0' })
    expect(await service.totalCents(WORKSPACE, MISSION)).toBe(0)
  })

  it('compte une facture CONTESTÉE dans le total — elle n’est pas annulée', async () => {
    const { service } = makeService({ totalCents: '45000' })
    expect(await service.totalCents(WORKSPACE, MISSION)).toBe(45_000)
  })
})

describe('SupplierInvoicesService.create', () => {
  it('crée toujours en `pending`, source `human`', async () => {
    const { service, invoices } = makeService()
    await service.create(WORKSPACE, USER, MISSION, {
      reference: 'FA-2026-120',
      amountCents: 30_000,
      invoiceDate: '2026-08-22',
    })
    expect(invoices.create).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'human', status: 'pending', entered_by: USER, mission_id: MISSION }),
    )
  })
})

describe('SupplierInvoicesService.update — une correction humaine gagne toujours', () => {
  it('accepte une édition HUMAINE sur une facture déjà HUMAINE', async () => {
    const { service, invoices } = makeService()
    await service.update(WORKSPACE, MISSION, INVOICE, { amountCents: 50_000 }, 'human')
    expect(invoices.update).toHaveBeenCalledWith({ id: INVOICE }, expect.objectContaining({ amount_cents: 50_000 }))
  })

  it('REFUSE un recalcul (`pipeline`) qui écraserait un montant SAISI À LA MAIN', async () => {
    const { service, invoices } = makeService()
    await service.update(WORKSPACE, MISSION, INVOICE, { amountCents: 999 }, 'pipeline')
    expect(invoices.update).not.toHaveBeenCalled()
  })

  it('refuse une facture introuvable', async () => {
    const { service } = makeService({ findOneMissing: true })
    await expect(service.update(WORKSPACE, MISSION, INVOICE, { amountCents: 1 })).rejects.toThrow(NotFoundException)
  })
})

describe('SupplierInvoicesService.setStatus', () => {
  it('fait avancer le statut, sans arbitrage de provenance', async () => {
    const { service, invoices } = makeService()
    await service.setStatus(WORKSPACE, MISSION, INVOICE, 'paid')
    expect(invoices.update).toHaveBeenCalledWith({ id: INVOICE }, { status: 'paid' })
  })

  it('accepte de repasser une facture PAYÉE en CONTESTÉE — le sous-traitant peut corriger', async () => {
    const { service, invoices } = makeService({
      existing: {
        id: INVOICE,
        mission_id: MISSION,
        workspace_id: WORKSPACE,
        reference: 'FA-2026-118',
        amount_cents: 45_000,
        invoice_date: '2026-08-15',
        status: 'paid',
        entered_by: USER,
        source: 'human',
        created_at: new Date(),
        updated_at: new Date(),
      },
    })
    await service.setStatus(WORKSPACE, MISSION, INVOICE, 'disputed')
    expect(invoices.update).toHaveBeenCalledWith({ id: INVOICE }, { status: 'disputed' })
  })

  it('refuse une facture introuvable', async () => {
    const { service } = makeService({ findOneMissing: true })
    await expect(service.setStatus(WORKSPACE, MISSION, INVOICE, 'paid')).rejects.toThrow(NotFoundException)
  })
})
