import { rankAccountContacts, type RankableContactRow } from '../contacts/contact-ranking'
import { titleMatchesFunction } from '../contacts/target-persona-match'
import { densifiedContactsFor } from './demo-contact-density'

/**
 * #3890.2 (ADD-SANOFI-04, retour bêta Sanofi 08/10/2026) — « un bon
 * interlocuteur situé au-delà de la première page peut remonter » n'avait
 * aucun cas à recetter en production : le compte Sanofi réel n'a aucune
 * personne DSI au-delà des cinq premiers du classement (recette prod 08/10,
 * « 0 DSI sur Sanofi »). `demo-contact-density.ts` ajoute donc un contact
 * SIMULÉ (Chloé Weber, Société Générale) qui reproduit le cas de l'incident
 * UNEO (#2533/#2547) à l'origine du correctif.
 *
 * Ce test fait tourner le VRAI classement (`rankAccountContacts`) sur les
 * VRAIS contacts simulés du compte — pas une liste reconstruite à la main —
 * pour que la preuve porte sur ce que la démonstration sert réellement.
 */
describe('#3890.2 — un bon interlocuteur situé au-delà de la première page peut remonter (démo)', () => {
  const toRow = (contact: ReturnType<typeof densifiedContactsFor>[number], index: number): RankableContactRow => ({
    id: `sg-${index}`,
    title: contact.title,
    entity: contact.entity,
    decision_role: contact.decision_role,
    email: contact.email,
    email_verified: false,
    phone: contact.phone,
    linkedin_url: null,
    source: 'demo',
    user_status: null,
    email_sent_at: null,
    last_enrichment_at: null,
    priority: contact.priority,
    demo_seed_first_door: true,
  })

  const rows = densifiedContactsFor('Société Générale').map(toRow)
  const target = rows.find(
    row => row.id === `sg-${densifiedContactsFor('Société Générale').findIndex(c => c.full_name === 'Chloé Weber')}`,
  )

  it('le contact ajouté existe bien dans le jeu de démonstration de Société Générale', () => {
    expect(target).toBeDefined()
  })

  it('« DSI » le retrouve, et il ne figure PAS dans les cinq premiers du classement', () => {
    const ranking = rankAccountContacts(rows, null, {})
    const byId = new Map(rows.map(row => [row.id, row]))
    const eligible = ranking.ranked.filter(entry => titleMatchesFunction(byId.get(entry.contact_id)?.title, 'DSI'))

    expect(eligible.length).toBeGreaterThan(0)
    const found = eligible.find(entry => entry.contact_id === target?.id)
    expect(found).toBeDefined()
    expect(found!.position).toBeGreaterThan(5)
  })
})
