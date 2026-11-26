import { DEMO_INTENTIONALLY_EMPTY } from './demo-coverage'

/**
 * #4187.6 — Zoho CRM est classé en démo : il n'a AUCUNE table à lui (`ZohoService` ne lit que
 * `crm_connections` et `user_actions`), donc son classement vit dans l'entrée de `crm_connections`,
 * « vide à dessein » avec sa raison. La garde sait dire non : retirer Zoho de la raison la fait rougir.
 */
describe('#4187.6 — Zoho classé dans demo-coverage', () => {
  it('crm_connections est vide à dessein ET nomme Zoho avec sa raison', () => {
    const reason = DEMO_INTENTIONALLY_EMPTY['crm_connections'] ?? ''
    expect(reason).toMatch(/Zoho/)
    expect(reason).toMatch(/aucun appel réseau/i)
  })
})
