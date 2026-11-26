import { describe, expect, it } from 'vitest'
import { billingAlertOf, missionBillingAlert } from './mission-billing-alert.js'

// #2408 (épopée #2979) — UN badge sur la ligne de mission, qui mène à Facturation.
const NOW = new Date('2026-10-15T12:00:00Z')
const invoiced = (over: Record<string, unknown> = {}) => ({
  invoicedAmountCents: 10_000_00,
  paidAt: null,
  paidAmountCents: null,
  dueOn: '2026-09-30',
  disputedAt: null,
  disputeResolvedAt: null,
  ...over,
})

describe('billingAlertOf — une facture émise', () => {
  it('échue et sans aucun règlement : facture échue', () => {
    expect(billingAlertOf(invoiced(), NOW)).toBe('invoice_overdue')
  })
  it('échue et réglée en partie : paiement en retard (le reste dû)', () => {
    expect(billingAlertOf(invoiced({ paidAt: '2026-10-02T00:00:00Z', paidAmountCents: 4_000_00 }), NOW)).toBe(
      'payment_late',
    )
  })
  it('SAIT DIRE NON — soldée, litige ouvert, pas encore échue, échéance inconnue : aucune alerte', () => {
    expect(billingAlertOf(invoiced({ paidAt: '2026-10-02T00:00:00Z', paidAmountCents: 10_000_00 }), NOW)).toBeNull()
    expect(billingAlertOf(invoiced({ disputedAt: '2026-10-01T00:00:00Z' }), NOW)).toBeNull()
    expect(billingAlertOf(invoiced({ dueOn: '2026-10-31' }), NOW)).toBeNull()
    expect(billingAlertOf(invoiced({ dueOn: null }), NOW)).toBeNull()
  })
  it('SAIT DIRE NON — le jour même de l’échéance n’est pas un retard', () => {
    expect(billingAlertOf(invoiced({ dueOn: '2026-10-15' }), NOW)).toBeNull()
  })
})

describe('missionBillingAlert — un seul badge, le plus grave', () => {
  it('échue avant retard de paiement avant bloquée', () => {
    expect(missionBillingAlert({ blocked: true, receivables: ['payment_late', 'invoice_overdue'] })).toBe(
      'invoice_overdue',
    )
    expect(missionBillingAlert({ blocked: true, receivables: ['payment_late'] })).toBe('payment_late')
    expect(missionBillingAlert({ blocked: true, receivables: [] })).toBe('invoice_blocked')
  })
  it('rien à signaler : null, jamais une valeur de repli', () => {
    expect(missionBillingAlert({ blocked: false, receivables: [] })).toBeNull()
  })
})
