import { demoFactoringAssignments, demoInvoiceHistory, demoUnmatchedPayments } from './demo-dataset'

/**
 * « FACTURES » ET « ENCAISSEMENTS » (Théo V22, lot R22-ECRAN-c14) EN DÉMONSTRATION.
 *
 * Les deux écrans lisent des tables DÉJÀ semées (`invoice_readiness`,
 * `invoice_payments`, `receivable_assignments`) : aucune table ni clé de
 * `raw_analysis` neuve, donc rien de neuf à classer dans `demo-coverage.ts`. Ce
 * qui doit rester VRAI, c'est que la salle montre chaque état que l'écran sait
 * dire — sans quoi il se découvre vide en réunion.
 *
 * Les BROUILLONS (mois « prêts », jamais émis) sont prouvés par
 * `demo-account-invoice-readiness-coverage.spec.ts` (deux `ready` le mois précédent).
 */
const NOW = Date.parse('2026-10-22T10:00:00.000Z')
const DAY = 86_400_000

describe('la démonstration remplit Factures et Encaissements', () => {
  const invoices = demoInvoiceHistory(NOW)

  it('porte une facture réglée À MOITIÉ dont le solde est échu — « Partielle · en retard »', () => {
    const partialOverdue = invoices.filter(
      invoice =>
        invoice.paidAt !== null &&
        invoice.invoicedAmountCents !== null &&
        invoice.paidAmountCents !== null &&
        invoice.paidAmountCents < invoice.invoicedAmountCents &&
        Date.parse(invoice.dueOn) < NOW - DAY,
    )
    expect(partialOverdue.length).toBeGreaterThan(0)
  })

  it('porte une facture en litige ET une facture jamais réglée et échue', () => {
    expect(invoices.some(invoice => invoice.disputedAt !== null && invoice.disputeResolvedAt === null)).toBe(true)
    expect(invoices.some(invoice => invoice.paidAt === null && Date.parse(invoice.dueOn) < NOW)).toBe(true)
  })

  it('porte une créance cédée, rattachée à une facture émise — le badge « Cédée »', () => {
    const issued = new Set(invoices.map(invoice => `${invoice.missionLabel}#${invoice.periodMonth}`))
    const ceded = demoFactoringAssignments(NOW).filter(
      assignment =>
        (assignment.status === 'assigned' || assignment.status === 'settled') &&
        issued.has(`${assignment.missionLabel}#${assignment.periodMonth}`),
    )
    expect(ceded.length).toBeGreaterThan(0)
  })

  it('porte un règlement non rapproché — la tuile « À rapprocher »', () => {
    expect(demoUnmatchedPayments(NOW).length).toBeGreaterThan(0)
  })
})
