import { DEMO_DELIVERY_CLIENT } from './demo-dataset'
import { DEMO_CONTACT_IDENTITY_CONFIRMED_COVERAGE } from './demo-coverage'

/**
 * #2160.58 — LA CONFIRMATION D'IDENTITÉ (« Bon contact confirmé »), JAMAIS
 * OBSERVABLE EN DÉMONSTRATION.
 *
 * `contacts.identity_confirmed_at`/`identity_confirmed_by` (migration
 * `1796001462218-ContactIdentityConfirmed`) sont deux colonnes NEUVES sur une
 * table déjà classée SEEDÉE — les deux gardes de `demo-coverage.spec.ts`
 * (tables ET clés `raw_analysis`) sont donc AVEUGLES à cette nouveauté, et une
 * garde aveugle n'est pas une exemption. `ContactCorrectionsCard.tsx` lit
 * `contact.identity_confirmed_at` pour choisir entre le badge « Bon contact
 * confirmé le {{date}} » et le bouton « Confirmer » — sans ligne semée, la
 * salle de démonstration ne montre jamais le badge.
 *
 * Décision Louis 04/10/2026 — plus aucun `identity_confirmed_at` semé : le
 * client d'exemple a quitté la salle ; jamais un verdict sur une personne réelle
 * des six dossiers : déclarer un verdict humain sur une vraie personne
 * inventerait un fait sur elle (même règle que `user_status`/`demo_seed_first_door`,
 * juste au-dessus dans `demo-dataset.ts`).
 *
 * Cette garde SAIT DIRE NON : elle relit le contact réellement construit
 * (`DEMO_DELIVERY_CLIENT.contacts`) — retirer le champ ou le contact fait
 * rougir la garde.
 */
// Décision Louis 04/10/2026 — vide à dessein : aucune déclaration inventée sur une personne réelle.
describe('couverture démo — confirmation d’identité de contact (#2160.58)', () => {
  it('le client de livraison ne crée AUCUN interlocuteur — aucun verdict posé sur une personne', () => {
    // Lot D01 (06/10/2026) : les interlocuteurs SIMULÉS (`.example`) existent, mais AUCUN ne porte de
    // confirmation d'identité — « Bon contact confirmé » reste vide à dessein.
    for (const contact of DEMO_DELIVERY_CLIENT.contacts) {
      expect(contact.email ?? '').toMatch(/\.example$/)
      expect(contact.identity_confirmed_at).toBeUndefined()
    }
  })

  it('reste classée VIDE À DESSEIN, avec la raison imposée', () => {
    expect(DEMO_CONTACT_IDENTITY_CONFIRMED_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_CONTACT_IDENTITY_CONFIRMED_COVERAGE.reason).toContain(
      'décision Louis 04/10 : aucune déclaration inventée sur une personne réelle',
    )
  })
})
