import { esnAnswersToProfileData } from '@bellum/contracts'
import { rankAccountContacts, type RankableContactRow } from '../contacts/contact-ranking'
import { profileOfferTokens } from '../contacts/contact-score-seller'
import { DEMO_CONTACT_RELEVANCE_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS, DEMO_ESN_PROFILE } from './demo-dataset'

/**
 * Lot 758 (CONTACTS 4/6) — craft rule n°9 : la priorisation par PERTINENCE se voit en salle.
 * L'offre du profil démo (`expertise_areas` → `offers`, « Data & Intelligence Artificielle »)
 * ordonne le dossier Société Générale ; son « Responsable achats informatiques » est l'acheteur
 * nommé sous un décideur. Cette garde sait dire NON : si le profil démo perdait son offre data
 * ou le dossier son acheteur, elle rougit.
 */
const sg = DEMO_DOSSIERS.find(d => d.account.company_name === 'Société Générale')

function rows(): RankableContactRow[] {
  return (sg?.contacts ?? []).map((c, i) => ({
    id: `demo-sg-${i}`,
    title: c.title,
    entity: c.entity,
    decision_role: c.decision_role,
    email: c.email,
    email_verified: false,
    phone: c.phone ?? null,
    linkedin_url: null,
    source: 'apollo',
    user_status: 'new',
    email_sent_at: null,
    last_enrichment_at: null,
    priority: c.priority,
    demo_seed_first_door: false,
  }))
}

describe('lot 758 — la pertinence en démonstration', () => {
  it('est classée SEEDÉE, avec sa raison', () => {
    expect(DEMO_CONTACT_RELEVANCE_COVERAGE.state).toBe('seede')
    expect(DEMO_CONTACT_RELEVANCE_COVERAGE.reason).toContain('Société Générale')
  })

  it('l’offre démo est déclarée, et elle porte la data', () => {
    const profile = esnAnswersToProfileData({ ...DEMO_ESN_PROFILE } as never)
    expect(profile.offers ?? []).toContain('Data & Intelligence Artificielle')
    expect(profileOfferTokens(profile).has('data')).toBe(true)
  })

  it('Société Générale : la plateforme de données passe devant l’architecte du SI, et l’acheteur est nommé', () => {
    // Le chemin rendu est coupé à dix (#2120.13) : on lit l'ordre de ces quatre sièges du dossier.
    const seats = new Set([
      'Responsable de la plateforme de données',
      'Architecte du système d’information groupe',
      'Directeur des systèmes d’information groupe',
      'Responsable achats informatiques',
    ])
    const all = rows().filter(row => seats.has(row.title ?? ''))
    expect(all).toHaveLength(4)
    const tokens = profileOfferTokens(esnAnswersToProfileData({ ...DEMO_ESN_PROFILE } as never))
    const ranking = rankAccountContacts(all, null, { profileOfferTokens: tokens }, all.length)
    const order = ranking.ranked.map(r => all.find(row => row.id === r.contact_id)?.title)
    const data = order.indexOf('Responsable de la plateforme de données')
    const archi = order.indexOf('Architecte du système d’information groupe')
    expect(data).toBeGreaterThanOrEqual(0)
    expect(archi).toBeGreaterThanOrEqual(0)
    expect(data).toBeLessThan(archi)
    expect(ranking.context.offer_source).toBe('profile')
    const buyer = all.find(row => row.id === ranking.procurement_contact_id)
    expect(buyer?.title).toBe('Responsable achats informatiques')
  })
})
