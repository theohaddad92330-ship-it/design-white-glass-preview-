import { DEMO_DOSSIERS, DEMO_PARTNER_RELATIONS } from './demo-dataset'
import { DEMO_CAMPAIGN_AUDIENCE_BUILDER_COVERAGE, DEMO_CAMPAIGN_AUDIENCE_SOURCES_COVERAGE } from './demo-coverage'
import { DEMO_OUTREACH_PLAN } from './demo-seed.service'
import { DEMO_REAL_CONTACTS_COMPANIES } from './commercial-brief-seed'

/**
 * Épopée #2974 (lot V39) — le constructeur d'audience est classé SEEDÉ parce
 * que la salle de démo porte DÉJÀ les trois cas que son écran montre. Cette
 * garde le rejoue sur les données : elle rougit le jour où l'un d'eux
 * disparaît du jeu sans que personne n'ait relu cette classification.
 */
describe('DEMO_CAMPAIGN_AUDIENCE_BUILDER_COVERAGE (#2974)', () => {
  const contacts = DEMO_DOSSIERS.flatMap(dossier => dossier.contacts)

  it('est classée SEEDÉE, avec une raison', () => {
    expect(DEMO_CAMPAIGN_AUDIENCE_BUILDER_COVERAGE.state).toBe('seede')
    expect(DEMO_CAMPAIGN_AUDIENCE_BUILDER_COVERAGE.reason).toContain('#2974')
  })

  it('des éligibles : plusieurs contacts avec e-mail et sans écartement', () => {
    const eligible = contacts.filter(contact => Boolean(contact.email) && !contact.exclusion_reason)
    expect(eligible.length).toBeGreaterThanOrEqual(3)
  })

  it('un opt-out : au moins un contact écarté, avec son motif', () => {
    expect(contacts.some(contact => Boolean(contact.exclusion_reason?.trim()))).toBe(true)
  })

  it('une collision : au moins une séquence ACTIVE semée sur un contact de la salle', () => {
    const names = new Set(contacts.map(contact => contact.full_name))
    expect(DEMO_OUTREACH_PLAN.some(entry => entry.status === 'active' && names.has(entry.contact))).toBe(true)
  })

  it('#2380.8 / #2380.12 — les sources import et comptes dormants sont vides à dessein, et la salle le prouve', () => {
    expect(DEMO_CAMPAIGN_AUDIENCE_SOURCES_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_CAMPAIGN_AUDIENCE_SOURCES_COVERAGE.reason).toContain('#2974')
    // Aucun compte dormant : la classification tombe le jour où on en sème un.
    expect(DEMO_DOSSIERS.some(dossier => dossier.account.commercial_status === 'dormant')).toBe(false)
  })

  it('#2380.13 / #2380.65 — partenaires sans e-mail de contact, aucune boîte personnelle : vides, et la salle le prouve', () => {
    expect(DEMO_CAMPAIGN_AUDIENCE_SOURCES_COVERAGE.reason).toContain('partners')
    expect(DEMO_CAMPAIGN_AUDIENCE_SOURCES_COVERAGE.reason).toContain('#2380.65')
    // La classification tombe le jour où une ESN de démo porte un e-mail de contact…
    expect(DEMO_PARTNER_RELATIONS.some(partner => 'contactEmail' in partner)).toBe(false)
    // … ou qu'un contact de démo a une boîte personnelle (webmail grand public).
    // Exemption NOMMÉE (décision de Louis, 01/10/2026) : le dossier Groupe BPCE sème les
    // coordonnées réelles du CSV, boîtes personnelles comprises (docblock de
    // `bpce-csv-mapping.ts`). La règle vaut pour tous les AUTRES dossiers.
    // Étendue le 01/10/2026 aux cinq comptes à brief commercial (« coordonnées en clair »).
    const governed = DEMO_DOSSIERS.filter(dossier => !DEMO_REAL_CONTACTS_COMPANIES.has(dossier.account.company_name))
    expect(governed.length).toBeLessThan(DEMO_DOSSIERS.length)
    const personal = /@(gmail|yahoo|hotmail|outlook|icloud|free|orange|wanadoo|sfr|laposte|proton)\./i
    expect(governed.flatMap(dossier => dossier.contacts).some(contact => personal.test(contact.email ?? ''))).toBe(
      false,
    )
  })
})
