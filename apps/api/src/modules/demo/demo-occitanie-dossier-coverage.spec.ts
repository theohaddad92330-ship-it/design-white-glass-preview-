import { DEMO_OCCITANIE_DOSSIER_COVERAGE } from './demo-coverage'
import { DEMO_ANALYSED_ACCOUNTS, DEMO_ESN_PROFILE, DEMO_VERIFICATION_RUNS } from './demo-dataset'
import { contactZoneStatus, sellerFocusFrom } from '../contacts/contact-seller-focus'
import { DEMO_OCCITANIE_COMPANY, DEMO_OCCITANIE_ZONE_LABEL } from './demo-occitanie-dossier'
import { DEMO_REAL_DISCOVER_COMPANIES } from './demo-discover-real-companies'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #4556 / #4432.4 (craft rule n°9) — « un dossier cadré sur l'Occitanie : les contacts de la zone d'abord, les
 * autres nommés `hors zone (Occitanie)`, et un contact sans lieu connu RESTE affiché ».
 *
 * Le vrai chemin (`scope_filter.py::filter_recommended_path`, apps/ia) lit le LIEU de la fiche : dans la zone → en
 * tête ; lieu connu hors zone → écarté, motif « hors zone (<zone>) » ; lieu absent → gardé, jamais « hors zone ».
 * La salle sème les TROIS cas sur Airbus (siège à Blagnac, 31 — compte réel de la salle).
 */
type Seeded = { full_name: string; location?: string | null; exclusion_reason?: string | null }

const airbusContacts = (): Seeded[] =>
  (DEMO_ANALYSED_ACCOUNTS.find(account => account.company_name === DEMO_OCCITANIE_COMPANY)?.contacts ??
    []) as unknown as Seeded[]
const wantedReason = `hors zone (${DEMO_OCCITANIE_ZONE_LABEL})`
const OCCITANIE_CITIES = ['toulouse', 'blagnac', 'montpellier', 'albi', 'tarbes']
const inZone = (location: string): boolean => OCCITANIE_CITIES.some(city => location.toLowerCase().includes(city))

describe('#4432.4 — le dossier cadré sur l’Occitanie, en démonstration', () => {
  it('le run de vérification d’Airbus porte le cadrage « région · Occitanie »', () => {
    const run = DEMO_VERIFICATION_RUNS.find(entry => entry.company === DEMO_OCCITANIE_COMPANY)
    expect(run?.scope_selection?.geo_perimeter).toBe('region')
    expect(run?.scope_selection?.geo_areas).toEqual([DEMO_OCCITANIE_ZONE_LABEL])
  })

  it('un contact DANS la zone, au lieu posé, non écarté', () => {
    const located = airbusContacts().filter(c => c.location && inZone(c.location) && !c.exclusion_reason)
    expect(located.length).toBeGreaterThan(0)
  })

  it('un contact HORS zone au lieu connu, écarté avec le motif « hors zone (Occitanie) »', () => {
    const away = airbusContacts().filter(c => c.exclusion_reason === wantedReason)
    expect(away.length).toBeGreaterThan(0)
    for (const contact of away) {
      expect(contact.location).toBeTruthy()
      expect(inZone(contact.location as string)).toBe(false)
    }
  })

  it('un contact SANS lieu connu : lieu `null`, jamais écarté (on n’écarte pas sur une absence)', () => {
    const unknown = airbusContacts().filter(c => c.location === null)
    expect(unknown.length).toBeGreaterThan(0)
    for (const contact of unknown) expect(contact.exclusion_reason ?? null).toBeNull()
  })

  it('sait dire NON : aucun contact « hors zone » n’est dans la zone, aucun lieu écarté n’est vide', () => {
    for (const contact of airbusContacts()) {
      if (contact.exclusion_reason !== wantedReason) continue
      expect(contact.location).not.toBeNull()
      expect(inZone(contact.location ?? '')).toBe(false)
    }
  })

  // #4556.4 — le chemin RÉEL du chip de zone (onglet Contacts) lit la zone du PROFIL de l'espace : sans Occitanie
  // dans le profil démo, les dix contacts d'Airbus sortaient « Hors zone » sans zone nommée et aucun « en zone ».
  it('#4556.4 — le profil démo déclare l’Occitanie : la fiche Airbus a un contact en zone et les autres hors zone NOMMÉS', () => {
    const focus = sellerFocusFrom({ offerDomain: 'esn_it', geoZone: DEMO_ESN_PROFILE.geo_zones.join(', ') })
    expect(focus?.zoneLabel).toContain('Occitanie')
    const statuses = airbusContacts().map(contact =>
      contactZoneStatus({ email: null, location: contact.location ?? null, title: null, raw_data: null }, focus),
    )
    expect(statuses).toContain('in_zone')
    expect(statuses).toContain('out_of_zone')
    expect(statuses).toContain('place_absent')
  })

  it('#4556.4 — sait dire NON : un contact à Toulouse n’est jamais « hors zone », un contact à Nantes l’est', () => {
    const focus = sellerFocusFrom({ offerDomain: 'esn_it', geoZone: DEMO_ESN_PROFILE.geo_zones.join(', ') })
    const at = (location: string) => contactZoneStatus({ email: null, location, title: null, raw_data: null }, focus)
    expect(at('Toulouse, France')).toBe('in_zone')
    expect(at('Nantes, France')).toBe('out_of_zone')
  })

  it('classe la capacité « seedée », avec le numéro du chantier et sa garde', () => {
    expect(DEMO_OCCITANIE_DOSSIER_COVERAGE.state).toBe('seede')
    expect(DEMO_OCCITANIE_DOSSIER_COVERAGE.reason).toContain('#4432.4')
    expect(DEMO_OCCITANIE_DOSSIER_COVERAGE.reason).toContain('demo-occitanie-dossier-coverage.spec.ts')
  })
})

type Card = {
  name: string
  sector: string | null
  city: string | null
  headcountRange: string | null
  signals: { type: string; url?: string }[]
}
const defaultList = (): Card[] => (demoDiscoverResponse({}) as unknown as { candidates: Card[] }).candidates

describe('#4556 — la liste de Découvrir semée, sans « Explorer »', () => {
  it('au moins 8 comptes RÉELS (jamais « (démo) »), chacun avec son secteur et son lieu', () => {
    const realNames = new Set(DEMO_REAL_DISCOVER_COMPANIES.map(company => company.name))
    const real = defaultList().filter(card => realNames.has(card.name))
    expect(real.length).toBeGreaterThanOrEqual(8)
    for (const card of real) {
      expect(card.name).not.toMatch(/\(démo\)/)
      expect(card.sector).toBeTruthy()
      expect(card.city).toBeTruthy()
    }
  })

  it('une taille absente ne s’écrit jamais « 0 » (GA-18 / GA-19)', () => {
    for (const card of defaultList()) {
      if (card.headcountRange === null) continue
      expect(card.headcountRange).not.toMatch(/^0\b/)
    }
  })

  it('au moins un compte de la liste porte une levée de fonds AVEC le lien de son annonce (#4285.1)', () => {
    const withLink = defaultList().filter(card => card.signals.some(s => s.type === 'funding' && s.url))
    expect(withLink.length).toBeGreaterThan(0)
    for (const card of defaultList())
      for (const signal of card.signals.filter(s => s.type === 'funding')) expect(signal.url).toMatch(/^https:\/\//)
  })
})
