import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RetainedInvoiceConnectorPort } from './invoice-connector.port'

/**
 * #2565 — companion démo : « en démo, AUCUN appel réseau vers un outil
 * client ». L'adaptateur RETENU est le SEUL branché aujourd'hui (voir
 * `invoice-connector.module.ts`), en démonstration comme en production —
 * donc le prouver ICI couvre les deux.
 */
describe('RetainedInvoiceConnectorPort — zéro appel réseau', () => {
  it('ne référence NI fetch NI aucun client HTTP dans sa source', () => {
    const source = readFileSync(join(__dirname, 'invoice-connector.port.ts'), 'utf8')
    for (const marker of ['fetch(', 'http.request', 'https.request', 'axios', 'XMLHttpRequest']) {
      expect(source).not.toContain(marker)
    }
  })

  it('refuse honnêtement, sans jamais confirmer une facture', async () => {
    const port = new RetainedInvoiceConnectorPort()
    const outcome = await port.createInvoice()
    expect(outcome.ok).toBe(false)
    expect(outcome).toMatchObject({ ok: false, outcome: 'failed' })
  })

  it('provider non-odoo : refus générique inchangé (#2565.10)', async () => {
    const port = new RetainedInvoiceConnectorPort()
    const outcome = await port.createInvoice({ provider: 'qonto', payload: {} })
    expect(outcome).toMatchObject({
      ok: false,
      outcome: 'failed',
      detail: "Aucun connecteur d'écriture vérifié pour cet outil — fonctionnalité retenue (#2565). Rien n'est parti.",
    })
  })

  it(
    'provider odoo : refus nommé et daté, pas le message générique (#2565.10, décision Louis 18/09 D2 + ' +
      'decisions-louis-18-09-soir.md #8)',
    async () => {
      const port = new RetainedInvoiceConnectorPort()
      const outcome = await port.createInvoice({ provider: 'odoo', payload: {} })
      expect(outcome.ok).toBe(false)
      expect(outcome).toMatchObject({ ok: false, outcome: 'failed' })
      if (outcome.ok) throw new Error('unreachable')
      expect(outcome.detail).toContain('Odoo')
      expect(outcome.detail).toContain('#2565.12')
      // Le contrat account.move n'est vérifié sur AUCUNE instance réelle : le
      // message le dit, il ne l'esquive pas.
      expect(outcome.detail).toMatch(/instance (de recette )?réelle/)
    },
  )

  it("un champ absent n'est JAMAIS deviné : aucune référence n'est inventée pour Odoo (#2565.10)", async () => {
    const port = new RetainedInvoiceConnectorPort()
    const outcome = await port.createInvoice({ provider: 'odoo', payload: {} })
    // « non mesuré » n'est jamais « 0 » (GA-18/GA-19) : pas de `reference`
    // fabriquée quand rien n'a été vérifié.
    expect('reference' in outcome).toBe(false)
  })
})
