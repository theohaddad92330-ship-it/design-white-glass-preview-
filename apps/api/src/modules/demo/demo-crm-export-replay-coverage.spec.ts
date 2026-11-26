import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_INTENTIONALLY_EMPTY } from './demo-coverage'

/**
 * #3719.4 — « exporté vers mon CRM le … » se REJOUE en salle de démonstration :
 * le connecteur CRM FICTIF (lot D01, `CrmService.exportContact`) répond sans réseau, la carte
 * consigne l'export (`PUT /contacts/:id/crm-exports/:provider`), et la remise à zéro de la salle
 * l'efface. La table reste vide au départ — un export semé serait un geste que personne n'a posé —
 * mais sa raison doit dire la vérité : la carte n'est PAS masquée en démo.
 */
describe('#3719.4 — l’export CRM se rejoue en démo, sans effet réel', () => {
  const reason = DEMO_INTENTIONALLY_EMPTY.contact_crm_exports ?? ''

  it('la raison « vide à dessein » nomme le connecteur fictif et le rejeu', () => {
    expect(reason).toMatch(/fictif/i)
    expect(reason).toMatch(/rejou/i)
  })

  it('SAIT DIRE NON : la raison ne prétend plus que la carte est masquée en démo', () => {
    expect(reason).not.toMatch(/masqu/i)
  })

  it('la remise à zéro de la salle efface les exports consignés par le visiteur précédent', () => {
    const source = readFileSync(join(__dirname, 'demo-reset.service.ts'), 'utf8')
    expect(source).toContain("'contact_crm_exports'")
  })
})
