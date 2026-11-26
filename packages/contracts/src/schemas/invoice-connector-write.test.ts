import { describe, expect, it } from 'vitest'
import { invoiceConnectorWriteIsReplayable, INVOICE_CONNECTOR_WRITE_STATES } from './invoice-connector-write.js'

/**
 * #2565.1 — « facturé » ne s'écrit que sur preuve du connecteur, et `unknown`
 * ne se rejoue jamais tout seul. Ce test porte la moitié PURE de la règle : la
 * fonction que `InvoiceConnectorWriteService.send` consulte avant de créer une
 * nouvelle tentative.
 */
describe('invoiceConnectorWriteIsReplayable', () => {
  it('un échec réseau est REJOUABLE — rien n’est jamais parti', () => {
    expect(invoiceConnectorWriteIsReplayable('failed')).toBe(true)
  })

  it('un `unknown` ne l’est PAS — la requête est peut-être partie, la rejouer facturerait deux fois', () => {
    expect(invoiceConnectorWriteIsReplayable('unknown')).toBe(false)
  })

  it('une facture déjà `invoiced` ne l’est pas non plus — rien à rejouer', () => {
    expect(invoiceConnectorWriteIsReplayable('invoiced')).toBe(false)
  })

  it('les états intermédiaires ne le sont pas — une tentative est déjà en cours', () => {
    expect(invoiceConnectorWriteIsReplayable('created')).toBe(false)
    expect(invoiceConnectorWriteIsReplayable('sent')).toBe(false)
  })

  it('la liste fermée couvre exactement les cinq états — preuve que le test lit la vraie liste', () => {
    expect(INVOICE_CONNECTOR_WRITE_STATES).toEqual(['created', 'sent', 'invoiced', 'failed', 'unknown'])
  })
})
