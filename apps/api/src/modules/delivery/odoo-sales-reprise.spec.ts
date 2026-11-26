import type { OdooSaleOrder } from '../odoo/odoo.client'
import { classifyOdooSales, draftFromSale, previewFingerprint } from './odoo-sales-reprise'

/** #2561/#2562 — la correspondance vente Odoo ↔ mission Bellum, en fonctions pures. */

function sale(overrides: Partial<OdooSaleOrder> = {}): OdooSaleOrder {
  return {
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
    ...overrides,
  }
}

const SNCF = { id: 'acc-sncf', company_name: 'SNCF' }

function mission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    label: 'Autre chose',
    account_id: 'acc-sncf',
    started_on: '2026-01-01',
    daily_rate: null,
    odoo_sale_order_id: null,
    ...overrides,
  }
}

describe('draftFromSale — ce qui deviendrait une mission, jamais deviné', () => {
  it('prend le libellé de la première ligne + la référence, la date d’engagement, le TJM unique', () => {
    expect(draftFromSale(sale())).toEqual({
      label: 'Data engineer — migration (S00042)',
      startedOn: '2026-09-15',
      dailyRate: 720,
    })
  })

  it('retombe sur la date de commande quand aucune date d’engagement n’est posée', () => {
    expect(draftFromSale(sale({ commitmentDate: null })).startedOn).toBe('2026-09-01')
  })

  it('ne choisit PAS un TJM entre deux prix différents — `null`, jamais une moyenne', () => {
    const draft = draftFromSale(
      sale({
        lines: [
          { label: 'A', quantity: 10, unitPrice: 700, subtotal: 7000 },
          { label: 'B', quantity: 5, unitPrice: 900, subtotal: 4500 },
        ],
      }),
    )
    expect(draft.dailyRate).toBeNull()
  })

  it('sans ligne, le libellé est la référence seule', () => {
    expect(draftFromSale(sale({ lines: [] })).label).toBe('S00042')
  })
})

describe('classifyOdooSales — « déjà une mission » ou « à reprendre »', () => {
  it('une vente DÉJÀ reprise (lien posé) se dit liée, sans brouillon', () => {
    const [row] = classifyOdooSales([sale()], [SNCF], [mission({ odoo_sale_order_id: 42, label: 'Repris' })])
    expect(row?.mission).toEqual({ id: 'm-1', label: 'Repris', by: 'link' })
    expect(row?.draft).toBeNull()
  })

  it('rapproche par compte + RÉFÉRENCE dans le libellé', () => {
    const [row] = classifyOdooSales([sale()], [SNCF], [mission({ label: 'Mission S00042 data' })])
    expect(row?.mission?.by).toBe('reference')
  })

  it('rapproche par compte + LIBELLÉ de la prestation', () => {
    const [row] = classifyOdooSales([sale()], [SNCF], [mission({ label: 'data engineer — MIGRATION' })])
    expect(row?.mission?.by).toBe('label')
  })

  it('rapproche par compte + DATES (même début, même TJM)', () => {
    const [row] = classifyOdooSales([sale()], [SNCF], [mission({ started_on: '2026-09-15', daily_rate: 720 })])
    expect(row?.mission?.by).toBe('dates')
  })

  it('ne rapproche PAS par dates quand le TJM diffère — deux consultants peuvent commencer le même jour', () => {
    const [row] = classifyOdooSales([sale()], [SNCF], [mission({ started_on: '2026-09-15', daily_rate: 500 })])
    expect(row?.mission).toBeNull()
    expect(row?.draft).not.toBeNull()
  })

  it('ne rapproche JAMAIS une mission d’un autre compte', () => {
    const [row] = classifyOdooSales([sale()], [SNCF], [mission({ account_id: 'acc-autre', label: 'S00042' })])
    expect(row?.mission).toBeNull()
  })

  it('une mission ne correspond qu’à UNE vente', () => {
    const rows = classifyOdooSales(
      [sale(), sale({ id: 43, reference: 'S00043' })],
      [SNCF],
      [mission({ label: 'data engineer — migration' })],
    )
    expect(rows.filter(row => row.mission !== null)).toHaveLength(1)
  })

  it('retrouve le compte par son nom EXACT (casse, accents, espaces neutralisés)', () => {
    const [row] = classifyOdooSales(
      [sale({ partnerName: '  societe   GÉNÉRALE ' })],
      [{ id: 'acc-sg', company_name: 'Société Générale' }],
      [],
    )
    expect(row?.account).toEqual({ id: 'acc-sg', name: 'Société Générale' })
  })

  it('NOMME l’absence de compte et ne propose aucun brouillon', () => {
    const [row] = classifyOdooSales([sale({ partnerName: 'Inconnue SA' })], [SNCF], [])
    expect(row).toMatchObject({ account: null, accountIssue: 'not_found', draft: null })
  })

  it('refuse de CHOISIR entre deux comptes homonymes', () => {
    const [row] = classifyOdooSales([sale()], [SNCF, { id: 'acc-sncf-2', company_name: 'sncf' }], [])
    expect(row).toMatchObject({ account: null, accountIssue: 'ambiguous', draft: null })
  })
})

describe('previewFingerprint — la prévisualisation FIGÉE', () => {
  it('change dès qu’un champ de ce qui sera créé change', () => {
    const item = {
      saleId: 42,
      reference: 'S00042',
      accountId: 'a',
      accountName: 'SNCF',
      label: 'X',
      startedOn: null,
      dailyRate: 700,
    }
    expect(previewFingerprint([item])).toBe(previewFingerprint([{ ...item }]))
    expect(previewFingerprint([item])).not.toBe(previewFingerprint([{ ...item, dailyRate: 710 }]))
  })
})
