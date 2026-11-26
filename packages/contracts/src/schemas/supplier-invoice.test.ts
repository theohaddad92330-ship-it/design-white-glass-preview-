import { describe, expect, it } from 'vitest'
import {
  createSupplierInvoiceSchema,
  setSupplierInvoiceStatusSchema,
  supplierInvoiceSchema,
  updateSupplierInvoiceSchema,
} from './supplier-invoice.js'

const VALID = {
  id: '00000000-0000-4000-8000-000000000001',
  missionId: '00000000-0000-4000-8000-000000000002',
  reference: 'FA-2026-118',
  amountCents: 45_000,
  invoiceDate: '2026-08-15',
  status: 'pending',
  enteredByUserId: '00000000-0000-4000-8000-000000000003',
  source: 'human',
  createdAt: '2026-08-15T09:00:00.000Z',
  updatedAt: '2026-08-15T09:00:00.000Z',
}

describe('supplierInvoiceSchema', () => {
  it('accepte une facture valide', () => {
    expect(supplierInvoiceSchema.parse(VALID)).toMatchObject({ reference: 'FA-2026-118', amountCents: 45_000 })
  })

  it('refuse un montant à zéro ou négatif', () => {
    expect(() => supplierInvoiceSchema.parse({ ...VALID, amountCents: 0 })).toThrow()
    expect(() => supplierInvoiceSchema.parse({ ...VALID, amountCents: -100 })).toThrow()
  })

  it('accepte les quatre statuts de son propre cycle de vie', () => {
    for (const status of ['pending', 'validated', 'paid', 'disputed']) {
      expect(supplierInvoiceSchema.parse({ ...VALID, status }).status).toBe(status)
    }
  })

  it('refuse un statut de la facturation CLIENT — deux notions, deux enums', () => {
    // `invoiced` / `collected` appartiennent à `invoice_readiness`, pas à la
    // facture fournisseur : les partager mélangerait deux sens opposés du mot
    // « facturé » (vendre vs. payer) derrière la même valeur.
    expect(() => supplierInvoiceSchema.parse({ ...VALID, status: 'invoiced' })).toThrow()
    expect(() => supplierInvoiceSchema.parse({ ...VALID, status: 'collected' })).toThrow()
  })

  it('accepte les quatre sources déjà en place dans le dépôt (`FieldSource`)', () => {
    for (const source of ['human', 'connector', 'pipeline', 'model']) {
      expect(supplierInvoiceSchema.parse({ ...VALID, source }).source).toBe(source)
    }
  })
})

describe('createSupplierInvoiceSchema', () => {
  it('accepte le strict minimum', () => {
    const parsed = createSupplierInvoiceSchema.parse({
      reference: 'FA-2026-119',
      amountCents: 12_000,
      invoiceDate: '2026-08-20',
    })
    expect(parsed.amountCents).toBe(12_000)
  })

  it('refuse un statut à la création — .strict()', () => {
    expect(() =>
      createSupplierInvoiceSchema.parse({
        reference: 'FA-2026-119',
        amountCents: 12_000,
        invoiceDate: '2026-08-20',
        status: 'paid',
      }),
    ).toThrow()
  })
})

describe('updateSupplierInvoiceSchema', () => {
  it('accepte un objet vide — rien ne change', () => {
    expect(updateSupplierInvoiceSchema.parse({})).toEqual({})
  })

  it('refuse un statut — le cycle de vie ne passe pas par cette porte', () => {
    expect(() => updateSupplierInvoiceSchema.parse({ status: 'paid' })).toThrow()
  })
})

describe('setSupplierInvoiceStatusSchema', () => {
  it('accepte un statut seul', () => {
    expect(setSupplierInvoiceStatusSchema.parse({ status: 'validated' })).toEqual({ status: 'validated' })
  })

  it('refuse un montant glissé dans le même corps — la porte ne parle QUE du statut', () => {
    expect(() => setSupplierInvoiceStatusSchema.parse({ status: 'validated', amountCents: 1 })).toThrow()
  })
})
