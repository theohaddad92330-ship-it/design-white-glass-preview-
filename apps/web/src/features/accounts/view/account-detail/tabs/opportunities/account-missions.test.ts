import { describe, expect, it } from 'vitest'
import type { ProjectReadRow } from '@bellum/contracts'
import { accountMissions, missionCoveredFacts, type MissionContact } from './account-missions'

const NOW = new Date('2026-10-07T10:00:00Z')

function row(over: Partial<ProjectReadRow>): ProjectReadRow {
  return {
    id: 'p-1',
    account_id: 'acc-1',
    company_name: 'Arquus',
    sector: null,
    logo_url: null,
    website: null,
    kind: 'signal',
    label: 'Renfort data pour la plateforme véhicules',
    detail: null,
    offer: null,
    source: 'Offre d’emploi publiée',
    confidence: null,
    urgency: null,
    stage: 'detected',
    stage_entered_at: '2026-10-01T00:00:00Z',
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    loss_reason: null,
    first_detected_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...over,
  } as ProjectReadRow
}

const contacts: MissionContact[] = [
  { id: 'c-1', full_name: 'Claire Morel', title: 'Directrice data', email: 'claire.morel@arquus.example', phone: null },
  { id: 'c-2', full_name: 'Paul Girard', title: 'Responsable achats', email: null, phone: '+33 1 23 45 67 89' },
  { id: 'c-3', full_name: 'Inès Haddad', title: 'DSI', email: null, phone: null },
]

describe('#3823.1 — les missions pour ce compte, chacune fondée sur un signal source daté', () => {
  it('une piste avec source et date devient une mission, avec ce qui la fonde', () => {
    const missions = accountMissions({ rows: [row({})], contacts, now: NOW })
    expect(missions).toHaveLength(1)
    expect(missions[0]).toMatchObject({
      key: 'p-1',
      title: 'Renfort data pour la plateforme véhicules',
      basis: {
        label: 'Renfort data pour la plateforme véhicules',
        source: 'Offre d’emploi publiée',
        observed_on: '2026-10-01',
      },
    })
  })

  it('NON : une ligne sans source n’est pas une mission — on n’en invente aucune', () => {
    expect(accountMissions({ rows: [row({ source: null })], contacts, now: NOW })).toEqual([])
  })

  it('NON : une ligne sans date n’est pas une mission', () => {
    expect(accountMissions({ rows: [row({ first_detected_at: 'pas une date' })], contacts, now: NOW })).toEqual([])
  })

  it('une affaire OUVERTE du pipe est une mission ; une affaire close ou archivée n’en est pas une', () => {
    const missions = accountMissions({
      rows: [
        row({ id: 'open', kind: 'opportunity', stage: 'qualified', label: 'TMA SI logistique' }),
        row({ id: 'won', kind: 'opportunity', stage: 'won', closed_at: '2026-09-01T00:00:00Z' }),
        row({ id: 'arch', kind: 'opportunity', stage: 'qualified', archived_at: '2026-09-01T00:00:00Z' }),
      ],
      contacts,
      now: NOW,
    })
    expect(missions.map(mission => mission.key)).toEqual(['open'])
  })

  it('une piste écartée par le commercial ne revient pas en mission', () => {
    const missions = accountMissions({
      rows: [row({})],
      decisions: [
        {
          lead_key: 'p-1',
          decision: 'dismissed',
          reason: null,
          note: null,
          decided_at: '2026-10-02',
          snoozed_until: null,
        },
      ],
      contacts,
      now: NOW,
    })
    expect(missions).toEqual([])
  })
})

describe('#3823.2 — à qui s’adresser : les contacts déjà connus, nommés en clair', () => {
  it('le contact dont le titre recoupe le rôle concerné passe en premier, nommé avec ses coordonnées', () => {
    const missions = accountMissions({
      rows: [row({ btmmp: { management: 'Direction data' } as ProjectReadRow['btmmp'] })],
      contacts,
      now: NOW,
    })
    expect(missions[0].contacts[0]).toMatchObject({ full_name: 'Claire Morel', email: 'claire.morel@arquus.example' })
    expect(missions[0].contacts_match).toBe('role')
  })

  it('sans rôle rapproché, seuls les contacts dont le métier recoupe CE fait restent proposés, et l’écran le DIT (jamais présentés comme LE bon)', () => {
    const missions = accountMissions({ rows: [row({})], contacts, now: NOW })
    // #4044 — « les contacts sont les mêmes sur tous les signaux » : le fait parle de data, seule la
    // directrice data le recoupe — plus les deux premiers contacts du compte, quel que soit le fait.
    expect(missions[0].contacts.map(contact => contact.full_name)).toEqual(['Claire Morel'])
    expect(missions[0].contacts_match).toBe('known')
  })

  it('#4044 — un fait que personne ne recoupe ne reçoit PAS la liste générique du compte', () => {
    const missions = accountMissions({
      rows: [row({ label: 'Levée de fonds de 40 M€' })],
      contacts,
      now: NOW,
    })
    expect(missions[0].contacts).toEqual([])
    expect(missions[0].contacts_match).toBe('none')
  })

  it('#4044 — deux faits de métiers différents ne proposent pas les mêmes personnes', () => {
    const [data, achats] = accountMissions({
      rows: [row({ id: 'p-1', label: 'Renfort data' }), row({ id: 'p-2', label: 'Appel d’offres achats groupe' })],
      contacts,
      now: NOW,
    })
    expect(data.contacts.map(c => c.id)).toEqual(['c-1'])
    expect(achats.contacts.map(c => c.id)).toEqual(['c-2'])
  })

  it('#4044 — le périmètre France écarte le contact étranger du fait, et un contact écarté n’est jamais proposé', () => {
    const missions = accountMissions({
      rows: [row({ label: 'Renfort data' })],
      contacts: [
        {
          id: 'es',
          full_name: 'Elena Ruiz',
          title: 'Head of data',
          email: null,
          phone: null,
          location: 'Madrid, Spain',
        },
        {
          id: 'fr',
          full_name: 'Paul Durand',
          title: 'Directeur data',
          email: null,
          phone: null,
          location: 'Paris, France',
        },
        {
          id: 'ex',
          full_name: 'Ancien Contact',
          title: 'Directeur data',
          email: null,
          phone: null,
          excluded_at: '2026-10-01T00:00:00Z',
        },
      ],
      perimeter: { geo_perimeter: 'france' },
      now: NOW,
    })
    expect(missions[0].contacts.map(c => c.id)).toEqual(['fr'])
  })
})

describe('#3823.3 — aucun contact connu : la mission le dit', () => {
  it('rend une liste vide et l’état « aucun »', () => {
    const missions = accountMissions({ rows: [row({})], contacts: [], now: NOW })
    expect(missions[0].contacts).toEqual([])
    expect(missions[0].contacts_match).toBe('none')
  })
})

// #3676 (recette prod 08/10, Sanofi — « Emmanuel Frenehard a présenté… » répété sur Missions,
// Pistes ET Synthèse) — `missionCoveredFacts` est ce que `useLeadCoveredFacts` relaie à la liste
// des signaux et à la synthèse (`TabSignal.tsx`) pour qu'un fait déjà dit par une MISSION — piste
// active OU affaire ouverte — n'y fasse pas une seconde ligne.
describe('#3676 — les faits qu’une mission dit déjà ne font pas une seconde ligne ailleurs', () => {
  it('couvre le fait d’une affaire OUVERTE (origin "opportunity"), pas seulement d’une piste', () => {
    const facts = missionCoveredFacts({
      rows: [row({ id: 'open', kind: 'opportunity', stage: 'qualified', label: 'TMA SI logistique' })],
      now: NOW,
    })
    expect(facts).toEqual([{ label: 'TMA SI logistique', source: 'Offre d’emploi publiée', observed_on: '2026-10-01' }])
  })

  it('couvre le fait d’une piste ACTIVE, comme avant ce lot', () => {
    const facts = missionCoveredFacts({ rows: [row({})], now: NOW })
    expect(facts.map(fact => fact.label)).toEqual(['Renfort data pour la plateforme véhicules'])
  })

  it('une piste écartée (dismissed) ne couvre rien — son signal doit rester lisible', () => {
    const facts = missionCoveredFacts({
      rows: [row({})],
      decisions: [
        {
          lead_key: 'p-1',
          decision: 'dismissed',
          reason: null,
          note: null,
          decided_at: '2026-10-02',
          snoozed_until: null,
        },
      ],
      now: NOW,
    })
    expect(facts).toEqual([])
  })

  it('une affaire close ou archivée ne couvre rien — elle n’est pas une mission', () => {
    const facts = missionCoveredFacts({
      rows: [row({ id: 'won', kind: 'opportunity', stage: 'won', closed_at: '2026-09-01T00:00:00Z' })],
      now: NOW,
    })
    expect(facts).toEqual([])
  })
})
