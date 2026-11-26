import { describe, expect, it } from 'vitest'
import type { ContactListItem, DiscoverCallListCompany } from '@bellum/contracts'
import type { DiscoverCandidate } from './discover-types'
import {
  buildCallListRows,
  callListPeople,
  callListFunnel,
  discoverCallListCsv,
  emptyCallListFilters,
  filterCallListRows,
  MAX_CONTACTS_PER_CALL_LIST_COMPANY,
  normalizeCompanyKey,
  type DiscoverCallListLabels,
} from './discover-call-list'

/* ------------------------------------------------------------------ */
/*  #2545.1-.4 — le tableau d'appels : joindre comptes et personnes,      */
/*  filtrer, exporter, expliquer la chute.                                */
/* ------------------------------------------------------------------ */

function candidate(overrides: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'Société Générale',
    siren: '552120222',
    nafCode: '6419Z',
    sector: 'Banque',
    city: 'Paris',
    department: '75',
    headcountRange: '1000+',
    creationDate: '1864-05-04',
    score: 80,
    scoreMax: 100,
    scoreUnmeasured: [],
    scoreFactors: [],
    signals: [
      { type: 'hiring', label: 'Recrute un DSI', date: '2026-09-01' },
      { type: 'tender', label: 'Appel d’offres IT', date: '2026-08-01' },
    ],
    dataConfidence: 72,
    angle: 'Modernisation du SI',
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    website: 'https://www.societegenerale.com',
    sources: [],
    ...overrides,
  }
}

function contact(overrides: Partial<ContactListItem> = {}): ContactListItem {
  return {
    id: 'c1',
    account_id: null,
    full_name: 'Jeanne Dupont',
    title: 'Directrice des Systèmes d’Information',
    entity: null,
    decision_role: null,
    priority: null,
    email: 'jeanne.dupont@example.com',
    phone: '+33612345678',
    linkedin_url: null,
    why_contact: null,
    user_status: 'new',
    source: null,
    company_name: 'Société Générale',
    ...overrides,
  }
}

describe('LUDOVIC-F F.3 — le lieu du contact vient du CONTACT, jamais du siège de l’entreprise', () => {
  it('`contactLocation` = le lieu collecté du contact ; absent ⇒ null (jamais Paris, la ville de l’entreprise)', () => {
    const projection = buildCallListRows(
      [candidate()],
      [contact({ id: 'a', location: 'Lyon, France' }), contact({ id: 'b', full_name: 'Marc Petit', location: '  ' })],
    )
    const byId = Object.fromEntries(projection.rows.map(row => [row.contactId, row.contactLocation]))
    expect(byId).toEqual({ a: 'Lyon, France', b: null })
    expect(projection.rows.every(row => row.city === 'Paris')).toBe(true)
  })
})

describe('normalizeCompanyKey — rapprochement entreprise ↔ contact', () => {
  it('neutralise casse, accents et forme juridique', () => {
    expect(normalizeCompanyKey('Société Générale')).toBe(normalizeCompanyKey('SOCIETE GENERALE SA'))
  })

  it("n'écrase pas deux entreprises différentes", () => {
    expect(normalizeCompanyKey('Thales')).not.toBe(normalizeCompanyKey('Thalys'))
  })
})

describe('buildCallListRows — #2545.1', () => {
  it('joint une personne connue à son entreprise, avec la VALEUR de ses coordonnées', () => {
    const projection = buildCallListRows([candidate()], [contact()])
    expect(projection.rows).toHaveLength(1)
    const row = projection.rows[0]
    expect(row?.company).toBe('Société Générale')
    expect(row?.fullName).toBe('Jeanne Dupont')
    expect(row?.email).toBe('jeanne.dupont@example.com')
    expect(row?.phone).toBe('+33612345678')
    expect(row?.reason).toBe('Modernisation du SI')
    expect(row?.signal).toEqual({ type: 'hiring', label: 'Recrute un DSI', date: '2026-09-01' })
    expect(row?.confidence).toBe(72)
  })

  it("garde la ligne ENTREPRISE quand aucun contact n'est connu — jamais retirée en silence", () => {
    const projection = buildCallListRows([candidate()], [])
    expect(projection.rows).toHaveLength(1)
    expect(projection.rows[0]?.contactId).toBeNull()
    expect(projection.rows[0]?.fullName).toBeNull()
    expect(projection.rows[0]?.unknown).toContain('person')
  })

  it('écarte une entreprise EXCLUE par la qualification, et la compte à part', () => {
    const excluded = candidate({
      qualification: { verdict: 'excluded', code: 'natural_person', reason: 'x', otherCodes: [] },
    })
    const projection = buildCallListRows([excluded], [contact()])
    expect(projection.rows).toHaveLength(0)
    expect(projection.excludedCompanies).toBe(1)
  })

  it('plafonne à dix contacts par entreprise et compte le dépassement', () => {
    const many = Array.from({ length: 12 }, (_, i) => contact({ id: `c${i}`, full_name: `Personne ${i}` }))
    const projection = buildCallListRows([candidate()], many)
    expect(projection.rows).toHaveLength(MAX_CONTACTS_PER_CALL_LIST_COMPANY)
    expect(projection.truncatedCompanies).toBe(1)
  })

  // Recette 21/10 D.1 (LC.3) — 10 contacts chez STILL, tous les appels au même endroit : la liste se répartit.
  it('répartit : 10 contacts d’une société et 3 d’une autre ⇒ 3 + 3 lignes, ordre conservé', () => {
    const still = Array.from({ length: 10 }, (_, i) =>
      contact({ id: `s${i}`, full_name: `Still ${i}`, company_name: 'STILL' }),
    )
    const other = Array.from({ length: 3 }, (_, i) =>
      contact({ id: `o${i}`, full_name: `Autre ${i}`, company_name: 'Enedis' }),
    )
    const projection = buildCallListRows(
      [candidate({ name: 'STILL', siren: '111' }), candidate({ name: 'Enedis', siren: '222' })],
      [...still, ...other],
    )
    expect(projection.rows.map(r => r.fullName)).toEqual([
      'Still 0',
      'Still 1',
      'Still 2',
      'Autre 0',
      'Autre 1',
      'Autre 2',
    ])
    expect(projection.truncatedCompanies).toBe(1)
  })

  it("ne rapproche pas un contact d'une autre entreprise", () => {
    const projection = buildCallListRows([candidate()], [contact({ company_name: 'Thales' })])
    expect(projection.rows).toHaveLength(1)
    expect(projection.rows[0]?.contactId).toBeNull()
  })

  it('nomme ce qui manque sur une personne sans la deviner', () => {
    const projection = buildCallListRows([candidate()], [contact({ title: null, email: null, phone: null })])
    const row = projection.rows[0]
    expect(row?.unknown).toEqual(expect.arrayContaining(['title', 'level', 'expertise', 'email', 'phone']))
  })
})

describe('filterCallListRows — #2545.2', () => {
  it('vide = aucune contrainte', () => {
    const projection = buildCallListRows([candidate()], [contact()])
    expect(filterCallListRows(projection.rows, emptyCallListFilters())).toHaveLength(1)
  })

  it('filtre sur la fonction, insensible à la casse', () => {
    const projection = buildCallListRows([candidate()], [contact()])
    const rows = filterCallListRows(projection.rows, { ...emptyCallListFilters(), title: 'systèmes' })
    expect(rows).toHaveLength(1)
    const none = filterCallListRows(projection.rows, { ...emptyCallListFilters(), title: 'ventes' })
    expect(none).toHaveLength(0)
  })

  it('« joignable seulement » écarte une ligne sans e-mail ni téléphone', () => {
    const projection = buildCallListRows([candidate()], [contact({ email: null, phone: null })])
    const rows = filterCallListRows(projection.rows, { ...emptyCallListFilters(), reachableOnly: true })
    expect(rows).toHaveLength(0)
  })
})

describe('callListFunnel — #2545.4, la chute expliquée', () => {
  it('détectés/vérifiés NON MESURÉS quand `coverage` est absent — jamais 0', () => {
    const projection = buildCallListRows([candidate()], [contact()])
    const funnel = callListFunnel(null, projection)
    expect(funnel.detected).toBeNull()
    expect(funnel.verified).toBeNull()
  })

  it('relit `coverage` déjà câblé à l’écran pour détectés/vérifiés', () => {
    const projection = buildCallListRows([candidate()], [contact()])
    const funnel = callListFunnel(
      {
        candidatesFound: 30,
        resolutionsAttempted: 28,
        resolved: 25,
        rejectedAmbiguous: 1,
        rejectedUnreachable: 1,
        notExamined: 2,
        stoppedOn: 'complete',
        resolveOffset: 0,
        hasMore: false,
      },
      projection,
    )
    expect(funnel.detected).toBe(30)
    expect(funnel.verified).toBe(25)
  })

  it('pertinents/enrichis comptent des ENTREPRISES, pas des lignes', () => {
    const withContact = candidate({ siren: '552120222', name: 'Société Générale' })
    const withoutContact = candidate({ siren: '552081317', name: 'Thales' })
    const projection = buildCallListRows([withContact, withoutContact], [contact()])
    const funnel = callListFunnel(null, projection)
    expect(funnel.relevant).toBe(2)
    expect(funnel.enriched).toBe(1)
  })
})

describe('discoverCallListCsv — #2545.3', () => {
  const labels: DiscoverCallListLabels = {
    company: 'Entreprise',
    website: 'Site',
    reason: 'Raison',
    signal: 'Signal',
    fullName: 'Nom',
    title: 'Fonction',
    location: 'Localisation',
    email: 'E-mail',
    phone: 'Téléphone',
    confidence: 'Confiance',
    action: 'Action',
    portfolioState: { new: 'Nouveau', analyzed: 'Analysé', watched: 'Suivi', customer: 'Client', parked: 'Écarté' },
  }

  it('exporte les colonnes attendues, dans l’ordre affiché', () => {
    const projection = buildCallListRows([candidate()], [contact()])
    const lines = discoverCallListCsv(projection.rows, labels).split('\n')
    expect(lines[0]).toContain(
      '"Entreprise","Site","Raison","Signal","Nom","Fonction","Localisation","E-mail","Téléphone","Confiance","Action"',
    )
    expect(lines[1]).toContain('"Société Générale"')
    expect(lines[1]).toContain('"jeanne.dupont@example.com"')
    expect(lines[1]).toContain('"Paris (75)"')
    expect(lines[1]).toContain('"Nouveau"')
  })

  it('un score de confiance ABSENT sort VIDE, jamais à 0', () => {
    const line = discoverCallListCsv(
      buildCallListRows([candidate({ dataConfidence: null })], [contact()]).rows,
      labels,
    ).split('\n')[1]
    expect(line).toContain('""')
    expect(line).not.toContain('"0"')
  })
})

/* #2545 / #3819 (démo Ludovic 08/10) — la SOURCE UNIQUE servie par
 * `POST /contacts/call-list` : les contacts DU compte, jamais les 50 derniers de l'espace. */
describe('buildCallListRows — source unique du serveur (#3819)', () => {
  function known(overrides: Partial<DiscoverCallListCompany> = {}): ReadonlyMap<string, DiscoverCallListCompany> {
    const company: DiscoverCallListCompany = {
      key: '552120222',
      accountId: 'acc-sg',
      contactsTotal: 160,
      contacts: [
        {
          id: 'k1',
          account_id: 'acc-sg',
          full_name: 'Claire Martin',
          title: 'DSI',
          entity: null,
          decision_role: null,
          email: 'claire.martin@sg.fr',
          email_verified: true,
          phone: '+33 1 00 00 00 00',
          why_contact: null,
          user_status: 'new',
          source: null,
          company_name: 'Société Générale',
        },
      ],
      signals: [],
      ...overrides,
    }
    return new Map([[company.key, company]])
  }

  it("lit les contacts classés du serveur et IGNORE la liste d'espace (plus de contradiction)", () => {
    const projection = buildCallListRows([candidate()], [contact({ id: 'stale', full_name: 'Jeanne' })], known())
    expect(projection.rows.map(r => r.fullName)).toEqual(['Claire Martin'])
    expect(projection.rows[0]).toMatchObject({
      email: 'claire.martin@sg.fr',
      phone: '+33 1 00 00 00 00',
      emailVerified: true,
      accountId: 'acc-sg',
    })
  })

  it("callListPeople : l'onglet Contacts lit les MÊMES personnes, dans l'ordre des comptes affichés", () => {
    const people = callListPeople([candidate(), candidate({ siren: '999' })], known())
    expect(people.map(p => p.full_name)).toEqual(['Claire Martin'])
  })

  it('compte « 10 sur 160 » comme une troncature, jamais tue', () => {
    expect(buildCallListRows([candidate()], [], known()).truncatedCompanies).toBe(1)
  })

  it('un candidat absent de la réponse reste une ligne entreprise sans personne', () => {
    const projection = buildCallListRows([candidate({ siren: '999' })], [contact()], known())
    expect(projection.rows).toHaveLength(1)
    expect(projection.rows[0]?.contactId).toBeNull()
  })

  it('la colonne signal préfère le signal COMMERCIAL le plus récent à la vie juridique', () => {
    const projection = buildCallListRows(
      [
        candidate({
          signals: [
            { type: 'legal', label: 'Modification du capital', date: '2026-10-01' },
            { type: 'tender', label: 'AO maintenance', date: '2026-09-15' },
          ],
        }),
      ],
      [],
      known(),
    )
    expect(projection.rows[0]?.signal?.label).toBe('AO maintenance')
  })
})

// LUDOVIC-E LC.4 — ENEDIS montrait « Claudie Grossetete » (avec e-mail) ET « Claudie » (même fonction, sans nom).
describe('buildCallListRows — LC.4 une personne n’apparaît pas deux fois', () => {
  const enedis = candidate({ name: 'ENEDIS', siren: '444608442' })
  const key = (rows: { fullName: string | null }[]) => rows.map(r => r.fullName)

  it('prénom seul + même fonction + même compte = même personne : on garde la fiche la plus complète', () => {
    const { rows } = buildCallListRows(
      [enedis],
      [
        contact({
          id: 'a',
          company_name: 'ENEDIS',
          full_name: 'Claudie',
          title: 'Chargée de mission',
          email: null,
          phone: null,
        }),
        contact({
          id: 'b',
          company_name: 'ENEDIS',
          full_name: 'Claudie Grossetete',
          title: 'Chargée de mission',
          email: 'c.g@enedis.fr',
          phone: null,
        }),
      ],
    )
    expect(key(rows)).toEqual(['Claudie Grossetete'])
  })

  it('dit NON : autre fonction, autre prénom ou deux noms complets = deux personnes', () => {
    const { rows } = buildCallListRows(
      [enedis],
      [
        contact({ id: 'a', company_name: 'ENEDIS', full_name: 'Claudie', title: 'Directrice' }),
        contact({ id: 'b', company_name: 'ENEDIS', full_name: 'Claudie Grossetete', title: 'Chargée de mission' }),
        contact({ id: 'c', company_name: 'ENEDIS', full_name: 'Paul', title: 'Directrice' }),
      ],
    )
    // (Recette 21/10 D.1 : le plafond par entreprise est à 3 — trois personnes distinctes suffisent à la preuve.)
    expect(key(rows)).toEqual(['Claudie', 'Claudie Grossetete', 'Paul'])
  })
})
