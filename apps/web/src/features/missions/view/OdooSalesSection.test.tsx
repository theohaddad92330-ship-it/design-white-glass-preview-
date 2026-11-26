import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OdooSaleRow, OdooSalesResponse } from '../odoo-sales-api'

const sales = vi.fn()
const preview = vi.fn()
const importer = vi.fn()

vi.mock('../odoo-sales-api', () => ({
  useOdooSales: () => sales(),
  useOdooSalesPreview: () => preview(),
  useOdooSalesImport: () => importer(),
}))

const { OdooSalesSection } = await import('./OdooSalesSection')

function row(over: Partial<OdooSaleRow> = {}): OdooSaleRow {
  return {
    saleId: 42,
    reference: 'S00042',
    clientName: 'SNCF',
    clientRef: null,
    orderDate: '2026-09-01',
    commitmentDate: '2026-09-15',
    invoiceStatus: 'to invoice',
    amountUntaxed: 39600,
    currency: 'EUR',
    lines: [{ label: 'Data engineer — migration', quantity: 55, unitPrice: 720, subtotal: 39600 }],
    account: { id: 'acc-sncf', name: 'SNCF' },
    accountIssue: null,
    mission: null,
    draft: { label: 'Data engineer — migration (S00042)', startedOn: '2026-09-15', dailyRate: 720 },
    ...over,
  }
}

function respond(data: OdooSalesResponse | undefined, isLoading = false) {
  sales.mockReturnValue({ data, isLoading, refetch: vi.fn() })
}

beforeEach(() => {
  cleanup()
  sales.mockReset()
  preview.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false, data: undefined, reset: vi.fn() })
  importer.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false })
})

/**
 * #2561/#2562 — « Ventes dans Odoo » sur /missions.
 *  1. rien sans outil branché (on n'affiche pas ce qu'on n'a pas) ;
 *  2. chaque vente dit « déjà une mission » ou propose sa reprise ;
 *  3. un délai dépassé se dit « on ne sait pas », jamais une liste vide ;
 *  4. la reprise passe par une PRÉVISUALISATION avant toute écriture.
 */
describe('OdooSalesSection', () => {
  it('ne rend RIEN sans outil branché, ni pendant le chargement', () => {
    respond({ status: 'not_connected' })
    const { container } = render(<OdooSalesSection />)
    expect(container).toBeEmptyDOMElement()
    respond(undefined, true)
    const second = render(<OdooSalesSection />)
    expect(second.container).toBeEmptyDOMElement()
  })

  it('nomme l’outil branché du client et liste ses ventes', () => {
    respond({ status: 'ok', demo: false, sales: [row()] })
    render(<OdooSalesSection />)
    expect(screen.getByRole('heading', { name: /ventes dans odoo/i })).toBeInTheDocument()
    expect(screen.getByText('S00042')).toBeInTheDocument()
    expect(screen.getByText(/data engineer — migration/i)).toBeInTheDocument()
    expect(screen.getByText(/à facturer/i)).toBeInTheDocument()
  })

  it('marque « déjà une mission » sans proposer de reprise', () => {
    respond({
      status: 'ok',
      demo: false,
      sales: [row({ mission: { id: 'm-1', label: 'Mission data', by: 'label' }, draft: null })],
    })
    render(<OdooSalesSection />)
    expect(screen.getByText(/déjà une mission : mission data/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reprendre en mission/i })).not.toBeInTheDocument()
  })

  it('NOMME le client sans compte Bellum, sans rien proposer', () => {
    respond({
      status: 'ok',
      demo: false,
      sales: [row({ clientName: 'Inconnue SA', account: null, accountIssue: 'not_found', draft: null })],
    })
    render(<OdooSalesSection />)
    expect(screen.getByText(/aucun compte bellum ne porte le nom « inconnue sa »/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reprendre/i })).not.toBeInTheDocument()
  })

  it('un délai dépassé se DIT — jamais une liste vide', () => {
    respond({ status: 'unknown', message: 'x' })
    render(<OdooSalesSection />)
    expect(screen.getByText(/n’a pas répondu à temps/i)).toBeInTheDocument()
  })

  it('une erreur de l’outil se dit avec SON message', () => {
    respond({ status: 'error', message: 'Accès refusé au modèle sale.order' })
    render(<OdooSalesSection />)
    expect(screen.getByText(/accès refusé au modèle sale\.order/i)).toBeInTheDocument()
  })

  it('« Reprendre en mission » demande d’abord la PRÉVISUALISATION — aucune écriture au clic', async () => {
    const mutatePreview = vi.fn()
    const mutateImport = vi.fn()
    preview.mockReturnValue({ mutate: mutatePreview, isPending: false, data: undefined, reset: vi.fn() })
    importer.mockReturnValue({ mutate: mutateImport, isPending: false })
    respond({ status: 'ok', demo: false, sales: [row()] })
    render(<OdooSalesSection />)
    await userEvent.click(screen.getByRole('button', { name: /reprendre en mission/i }))
    expect(mutatePreview).toHaveBeenCalledWith([42], expect.anything())
    expect(mutateImport).not.toHaveBeenCalled()
  })

  it('la prévisualisation figée montre ce qui sera créé, et SEUL son bouton crée — avec l’empreinte', async () => {
    const mutateImport = vi.fn()
    importer.mockReturnValue({ mutate: mutateImport, isPending: false })
    preview.mockReturnValue({
      mutate: (_ids: number[], options: { onSuccess: (value: unknown) => void }) =>
        options.onSuccess({
          status: 'ok',
          fingerprint: 'f'.repeat(64),
          items: [
            {
              saleId: 42,
              reference: 'S00042',
              accountId: 'acc-sncf',
              accountName: 'SNCF',
              label: 'Data engineer — migration (S00042)',
              startedOn: '2026-09-15',
              dailyRate: 720,
            },
          ],
          skipped: [],
        }),
      isPending: false,
    })
    respond({ status: 'ok', demo: false, sales: [row()] })
    render(<OdooSalesSection />)
    await userEvent.click(screen.getByRole('button', { name: /reprendre en mission/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Data engineer — migration (S00042)')).toBeInTheDocument()
    expect(within(dialog).getByText(/compte : sncf/i)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: /créer 1 mission/i }))
    expect(mutateImport).toHaveBeenCalledWith({ saleIds: [42], fingerprint: 'f'.repeat(64) }, expect.anything())
  })

  it('« Reprendre toutes » ne vise que les ventes à reprendre', async () => {
    const mutatePreview = vi.fn()
    preview.mockReturnValue({ mutate: mutatePreview, isPending: false })
    respond({
      status: 'ok',
      demo: false,
      sales: [
        row(),
        row({ saleId: 43, reference: 'S00043' }),
        row({ saleId: 44, reference: 'S00044', mission: { id: 'm', label: 'M', by: 'link' }, draft: null }),
      ],
    })
    render(<OdooSalesSection />)
    await userEvent.click(screen.getByRole('button', { name: /reprendre toutes \(2\)/i }))
    expect(mutatePreview).toHaveBeenCalledWith([42, 43], expect.anything())
  })
})
