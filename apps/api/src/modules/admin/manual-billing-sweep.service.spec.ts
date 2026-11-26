import { Logger } from '@nestjs/common'
import { ManualBillingSweepService } from './manual-billing-sweep.service'
import type { ManualClientRow } from './manual-provisioning.service'
import { billingHealth } from './manual-billing-schedule'

/**
 * Le balayage quotidien des contrats sur facture.
 *
 * Ce qu'il doit prouver, comme toute garde du dépôt : qu'il LIT quelque chose
 * (un client en règle ne produit rien, un client échu produit une erreur), et
 * qu'il sait dire NON (interrupteur posé = zéro examen, pas « tout va bien »).
 */

const client = (over: Partial<ManualClientRow> = {}): ManualClientRow => ({
  workspaceId: '22222222-2222-4222-8222-222222222222',
  workspaceName: 'Aquila Data Enabler',
  ownerEmail: 'julien@example.fr',
  plan: 'beta',
  billingMode: 'manual',
  amountCents: 11900,
  currency: 'EUR',
  period: 'monthly',
  startDate: '2026-09-01',
  commitmentMonths: 3,
  billedToName: 'Julien Laszlo',
  billedToKind: 'person',
  billingEmail: 'julien@example.fr',
  billingPhone: '06 37 71 74 80',
  reference: null,
  notes: null,
  invoices: [],
  health: billingHealth({ period: 'monthly', startDate: '2026-09-01', commitmentMonths: 3 }, [], '2026-09-02'),
  ...over,
})

/** Trois mois facturés, puis plus rien — le cas qui a fait écrire ce balayage. */
const endedUnrenewed = (): ManualClientRow => {
  const invoices = [
    { reference: 'F-2026-006', periodStart: '2026-09-01', periodEnd: '2026-09-30', paid: true },
    { reference: 'F-2026-021', periodStart: '2026-10-01', periodEnd: '2026-10-31', paid: true },
    { reference: 'F-2026-044', periodStart: '2026-11-01', periodEnd: '2026-11-30', paid: true },
  ]
  return client({
    health: billingHealth({ period: 'monthly', startDate: '2026-09-01', commitmentMonths: 3 }, invoices, '2026-12-10'),
  })
}

describe('ManualBillingSweepService', () => {
  let listManualClients: jest.Mock
  let service: ManualBillingSweepService
  let error: jest.SpyInstance
  let warn: jest.SpyInstance
  let log: jest.SpyInstance

  beforeEach(() => {
    delete process.env.MANUAL_BILLING_SWEEP_DISABLED
    listManualClients = jest.fn().mockResolvedValue([])
    service = new ManualBillingSweepService({ listManualClients } as never)
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    delete process.env.MANUAL_BILLING_SWEEP_DISABLED
  })

  it('says nothing about a client who is up to date', async () => {
    listManualClients.mockResolvedValue([client()])

    const report = await service.sweep()

    expect(report).toMatchObject({ examined: 1, flagged: 0, endedUnrenewed: 0 })
    expect(error).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns (signal métier, déjà à l’écran Facturation et aux alertes back-office) on a commitment that ended with no renewal', async () => {
    listManualClients.mockResolvedValue([endedUnrenewed()])

    const report = await service.sweep()

    expect(report).toMatchObject({ examined: 1, flagged: 1, endedUnrenewed: 1 })
    expect(error).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    const [line, meta] = warn.mock.calls[0] as [string, Record<string, unknown>]
    expect(line).toContain('Aquila Data Enabler')
    expect(line).toContain('commitment_ended_unrenewed')
    // La méta voyage par le logger (jamais `captureException` en direct) et ne
    // recopie ni montant ni e-mail : l'espace suffit à retrouver la ligne.
    expect(meta).toMatchObject({ tags: { 'billing.manual': 'danger' } })
    expect(JSON.stringify(meta)).not.toContain('julien@example.fr')
    expect(JSON.stringify(meta)).not.toContain('11900')
  })

  it('warns — without erroring — on an invoice that is merely late', async () => {
    const late = client({
      health: billingHealth({ period: 'monthly', startDate: '2026-09-01', commitmentMonths: 3 }, [], '2026-09-10'),
    })
    listManualClients.mockResolvedValue([late])

    const report = await service.sweep()

    expect(report).toMatchObject({ flagged: 1, invoicesMissing: 1, endedUnrenewed: 0 })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(error).not.toHaveBeenCalled()
  })

  it('counts every client, not only the first flagged one', async () => {
    listManualClients.mockResolvedValue([client(), endedUnrenewed(), endedUnrenewed()])
    const report = await service.sweep()
    expect(report).toMatchObject({ examined: 3, flagged: 2, endedUnrenewed: 2 })
  })

  it('SAIT DIRE NON : interrupteur posé, rien n’est examiné et rien n’est affirmé', async () => {
    process.env.MANUAL_BILLING_SWEEP_DISABLED = 'true'
    listManualClients.mockResolvedValue([endedUnrenewed()])

    const report = await service.sweep()

    expect(listManualClients).not.toHaveBeenCalled()
    expect(report).toEqual({ examined: 0, flagged: 0, endedUnrenewed: 0, invoicesMissing: 0, invoicesUnpaid: 0 })
    expect(error).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('désactivé'))
  })

  it('reste ARMÉ sur une valeur qui n’est pas exactement « true »', async () => {
    // Strict par choix : un garde-fou éteint par une faute de frappe ne se
    // remarque pas.
    process.env.MANUAL_BILLING_SWEEP_DISABLED = 'yes'
    listManualClients.mockResolvedValue([endedUnrenewed()])

    const report = await service.sweep()

    expect(report.examined).toBe(1)
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
