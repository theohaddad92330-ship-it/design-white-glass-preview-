import { normalizeFullName } from '../contacts/contact-identity'
import { DEMO_DOSSIERS } from './demo-dataset'
import { seatName } from './demo-seat-names'
import { filterEligibleContacts } from '../contacts/contact-eligibility'
import { DEMO_CONTACT_RECOMMENDATION_AUTHORIZED_COVERAGE } from './demo-coverage'

/**
 * #2160.60 — « AUTORISER LA RECOMMANDATION », JAMAIS OBSERVABLE EN
 * DÉMONSTRATION avant ce lot.
 *
 * `ContactRecommendationAuthorizationCard.tsx` ne s'affiche QUE quand le
 * classement du compte écarte ACTUELLEMENT le contact pour `homonym_conflict`
 * ou `entity_mismatch` (`contact-eligibility.ts`, `filterEligibleContacts`).
 * Sans une VRAIE paire de fiches actives qui partagent le nom normalisé, ce
 * geste ne se rencontre jamais en salle de démonstration — cette garde relit
 * le dossier SNCF réellement construit et rejoue `filterEligibleContacts`
 * dessus, elle ne prend pas la parole de `demo-dataset.ts` pour argent
 * comptant.
 *
 * Cette garde SAIT DIRE NON : désaligner les deux intitulés, retirer un des
 * deux sièges, ou retirer la levée sur le premier la fait rougir.
 */
describe('couverture démo — autorisation de recommandation sur homonyme (#2160.60)', () => {
  const sncf = DEMO_DOSSIERS.find(d => d.account.company_name === 'SNCF')

  it('lit un corpus NON VIDE — sans lui, la garde passerait au vert sur du vide', () => {
    expect(sncf).toBeDefined()
    expect(sncf?.contacts.length ?? 0).toBeGreaterThan(0)
  })

  const isSeat = (title: string): boolean =>
    title === 'Responsable des systèmes d’information d’une filiale de transport'

  it('SNCF porte deux sièges au même intitulé, sur deux filiales distinctes — à des noms que la base accepte', () => {
    const seats = sncf!.contacts.filter(c => isSeat(c.title))
    expect(seats).toHaveLength(2)
    expect(new Set(seats.map(c => c.entity)).size).toBe(2)
    // I31 (05/10) : `idx_contacts_account_normalized_name` interdit deux contacts au même nom normalisé sur un compte.
    expect(new Set(seats.map(c => normalizeFullName(c.full_name))).size).toBe(2)
  })

  it('un seul des deux porte une autorisation semée pour `homonym_conflict`', () => {
    const authorized = sncf!.contacts.filter(
      c => isSeat(c.title) && c.recommendation_authorized_reason === 'homonym_conflict',
    )
    expect(authorized).toHaveLength(1)
    expect(authorized[0]?.recommendation_authorized_at).toBeTruthy()
  })

  it('`filterEligibleContacts` écarte le siège NON autorisé pour `homonym_conflict` et laisse passer l’autre (homonymie reconstituée : la base n’en admet plus dans le jeu)', () => {
    const rows = sncf!.contacts
      .filter(c => isSeat(c.title))
      .map((c, i) => ({
        id: `sncf-${i}`,
        full_name: seatName('Responsable des systèmes d’information d’une filiale de transport'),
        entity: c.entity,
        hidden: false,
        excluded_at: null,
        recommendation_authorized_reason: c.recommendation_authorized_reason ?? null,
      }))
    const { excluded, eligible } = filterEligibleContacts(rows, sncf!.account.raw_analysis as Record<string, unknown>)
    expect(excluded.find(x => rows.some(r => r.id === x.contact_id))?.reason).toBe('homonym_conflict')
    expect(eligible.filter(r => rows.some(x => x.id === r.id))).toHaveLength(1)
  })

  it('reste classée SEEDÉE, avec sa raison écrite', () => {
    expect(DEMO_CONTACT_RECOMMENDATION_AUTHORIZED_COVERAGE.state).toBe('seede')
    expect(DEMO_CONTACT_RECOMMENDATION_AUTHORIZED_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
