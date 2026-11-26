import { billingAlertOf } from '@bellum/contracts'
import { demoInvoiceHistory } from './demo-dataset'

/**
 * #2979.90 — le badge de facturation (`billingAlert`) d'une mission est VISIBLE en démo.
 *
 * Le badge se lit de `invoice_readiness` par `billingAlertOf` (la dérivation de l'écran Encaissements). Une salle
 * où aucune facture n'est en retard montrerait /missions sans le badge — l'écran livré, muet en réunion
 * (craft rule n°9). La garde recalcule le badge SUR LE JEU, avec la fonction du contrat ; elle sait dire non :
 * régler toutes les factures du jeu, ou retirer leurs échéances, la fait rougir.
 */
const NOW = Date.parse('2026-10-17T10:00:00Z')

const alerts = demoInvoiceHistory(NOW).map(invoice => ({
  mission: invoice.missionLabel,
  alert: billingAlertOf(
    {
      invoicedAmountCents: invoice.invoicedAmountCents,
      paidAt: invoice.paidAt,
      paidAmountCents: invoice.paidAmountCents,
      dueOn: invoice.dueOn,
      disputedAt: invoice.disputedAt,
      disputeResolvedAt: invoice.disputeResolvedAt,
    },
    new Date(NOW),
  ),
}))

describe('#2979.90 — le badge de facturation d’une mission existe dans la salle de démo', () => {
  it('au moins une mission porte une facture échue : le badge s’affiche', () => {
    expect(alerts.some(entry => entry.alert !== null)).toBe(true)
  })

  it('NON : une facture réglée ne porte aucun badge — la salle ne les fabrique pas toutes', () => {
    const settled = demoInvoiceHistory(NOW).filter(invoice => invoice.paidAt !== null && invoice.disputedAt === null)
    expect(settled.length).toBeGreaterThan(0)
    expect(alerts.some(entry => entry.alert === null)).toBe(true)
  })
})
