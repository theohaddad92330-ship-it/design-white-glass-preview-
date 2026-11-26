import { describe, expect, it } from 'vitest'
import type { AnalysisScopeSelection } from '@bellum/contracts'
import { proposeContactsForSignal, type ProposableContact } from './signal-contacts'

// #4044 (Louis, 12/10) — « les contacts sont les mêmes sur tous les signaux, et en plus ce sont des
// contacts non français, pour une boîte dont j'ai mis le périmètre en France ».
const france: AnalysisScopeSelection = { geo_perimeter: 'france' }

function contact(over: Partial<ProposableContact> & { id: string }): ProposableContact {
  return { full_name: `Contact ${over.id}`, title: null, email: null, phone: null, ...over }
}

const madridCfo = contact({
  id: 'es',
  full_name: 'Elena Ruiz',
  title: 'Head of data',
  place: { country: 'Spain', city: 'Madrid', organization: null },
})
const parisData = contact({
  id: 'fr-data',
  full_name: 'Paul Durand',
  title: 'Directeur data',
  location: 'Paris, France',
  place: { country: 'France', city: 'Paris', organization: null },
})
const lyonCloud = contact({
  id: 'fr-cloud',
  full_name: 'Sophie Martin',
  title: 'Responsable cloud et infrastructure',
  location: 'Lyon, France',
  place: { country: 'France', city: 'Lyon', organization: null },
})
const unknownPlace = contact({ id: 'x', full_name: 'Alex Inconnu', title: 'Directeur général' })

describe('#4044.a — le périmètre déclaré filtre les contacts proposés', () => {
  it('un contact hors périmètre n’est jamais proposé en premier, et sort dès qu’un contact dans le périmètre existe', () => {
    const result = proposeContactsForSignal({
      contacts: [madridCfo, parisData],
      signal: { text: 'Recrutement data engineer', role: null, location: null },
      perimeter: france,
    })
    expect(result.contacts.map(c => c.id)).toEqual(['fr-data'])
  })

  it('un contact écarté ou masqué n’est jamais proposé', () => {
    const result = proposeContactsForSignal({
      contacts: [{ ...parisData, excluded_at: '2026-10-01T00:00:00Z' }, { ...lyonCloud, hidden: true }, unknownPlace],
      signal: { text: 'Directeur général nommé', role: 'directeur général', location: null },
      perimeter: france,
    })
    expect(result.contacts.map(c => c.id)).toEqual(['x'])
  })

  it('un lieu inconnu reste proposable (une absence ne prouve rien)', () => {
    const result = proposeContactsForSignal({
      contacts: [unknownPlace],
      signal: { text: 'Nomination du directeur général', role: 'directeur général', location: null },
      perimeter: france,
    })
    expect(result.contacts.map(c => c.id)).toEqual(['x'])
  })

  it('sans périmètre déclaré, rien n’est écarté sur le lieu', () => {
    const result = proposeContactsForSignal({
      contacts: [madridCfo],
      signal: { text: 'Projet data', role: 'directeur data', location: null },
      perimeter: undefined,
    })
    expect(result.contacts.map(c => c.id)).toEqual(['es'])
  })

  it('aucun contact dans le périmètre : un contact lié par le rôle hors périmètre reste, mais jamais comme « contact connu »', () => {
    const byRole = proposeContactsForSignal({
      contacts: [madridCfo],
      signal: { text: 'Projet data', role: 'directeur data', location: null },
      perimeter: france,
    })
    expect(byRole.contacts.map(c => c.id)).toEqual(['es'])
    expect(byRole.match).toBe('role')
    const known = proposeContactsForSignal({
      contacts: [madridCfo],
      signal: { text: 'Levée de fonds', role: null, location: null },
      perimeter: france,
    })
    expect(known.contacts).toEqual([])
    expect(known.match).toBe('none')
  })
})

describe('#4044.b — chaque signal propose les contacts qui le concernent', () => {
  const contacts = [parisData, lyonCloud]

  it('deux signaux de métiers différents ne proposent pas la même liste', () => {
    const data = proposeContactsForSignal({
      contacts,
      signal: { text: 'Data engineer — recrutement', role: null, location: null },
      perimeter: france,
    })
    const cloud = proposeContactsForSignal({
      contacts,
      signal: { text: 'Architecte cloud — recrutement', role: null, location: null },
      perimeter: france,
    })
    expect(data.contacts.map(c => c.id)).toEqual(['fr-data'])
    expect(cloud.contacts.map(c => c.id)).toEqual(['fr-cloud'])
  })

  it('le lieu du signal départage à égalité de métier', () => {
    const lyonData = contact({ id: 'lyon-data', title: 'Responsable data', location: 'Lyon, France' })
    const result = proposeContactsForSignal({
      contacts: [parisData, lyonData],
      signal: { text: 'Data engineer — recrutement', role: null, location: 'Lyon' },
      perimeter: france,
    })
    expect(result.contacts.map(c => c.id)[0]).toBe('lyon-data')
  })

  it('un signal sans aucun recoupement ne reçoit PAS la liste générique : le bouton « Trouver qui contacter » s’affiche', () => {
    const result = proposeContactsForSignal({
      contacts,
      signal: { text: 'Levée de fonds de 40 M€', role: null, location: null },
      perimeter: france,
    })
    expect(result).toEqual({ contacts: [], match: 'none' })
  })

  it('la personne NOMMÉE dans le fait passe avant tout', () => {
    const result = proposeContactsForSignal({
      contacts,
      signal: { text: 'Sophie Martin nommée directrice cloud', role: null, location: null },
      perimeter: france,
    })
    expect(result.contacts[0]?.id).toBe('fr-cloud')
    expect(result.match).toBe('role')
  })

  it('les coordonnées pro restent EN CLAIR (c87) : le contact rendu porte email et téléphone tels quels', () => {
    const reachable = contact({ id: 'r', title: 'Directeur data', email: 'p@acme.fr', phone: '+33 1 02 03 04 05' })
    const [first] = proposeContactsForSignal({
      contacts: [reachable],
      signal: { text: 'Projet data', role: 'directeur data', location: null },
      perimeter: france,
    }).contacts
    expect(first).toMatchObject({ email: 'p@acme.fr', phone: '+33 1 02 03 04 05' })
  })

  it('à pertinence égale, l’ordre d’arrivée (la priorité du dossier) est conservé — aucun critère protégé dans le rang', () => {
    const a = contact({ id: 'a', title: 'Directeur data' })
    const b = contact({ id: 'b', title: 'Directeur data' })
    const result = proposeContactsForSignal({
      contacts: [b, a],
      signal: { text: 'Projet data', role: 'directeur data', location: null },
      perimeter: undefined,
    })
    expect(result.contacts.map(c => c.id)).toEqual(['b', 'a'])
  })
})

describe('#4044 — recette prod 12/10 (DECATHLON, périmètre France) : lieux écrits dans la langue du pays', () => {
  // La collecte ne pose souvent ni pays ni ville : seul le texte libre « Frankfurt am Main » ou l'employeur
  // « Decathlon España » dit où la personne travaille. Le test de périmètre doit le lire.
  const frankfurt = contact({
    id: 'de',
    full_name: 'Hannes Weber',
    title: 'Head of data',
    location: 'Frankfurt am Main',
  })
  const espana = contact({
    id: 'es2',
    full_name: 'Jordi Puig',
    title: 'Data platform lead',
    place: { country: null, city: null, organization: 'Decathlon España' },
  })

  it('un contact allemand ou espagnol sans pays n’est proposé ni en premier ni en « contact connu »', () => {
    const result = proposeContactsForSignal({
      contacts: [frankfurt, espana, parisData],
      signal: { text: 'Montée en charge des plateformes data', role: null, location: null },
      perimeter: france,
    })
    expect(result.contacts.map(c => c.id)).toEqual(['fr-data'])
  })

  it('sans aucun contact français, ils ne sont pas « connus » non plus : le bouton « Trouver qui contacter » s’affiche', () => {
    const result = proposeContactsForSignal({
      contacts: [frankfurt, espana],
      signal: { text: 'Montée en charge des plateformes data', role: null, location: null },
      perimeter: france,
    })
    expect(result).toEqual({ contacts: [], match: 'none' })
  })
})

// #4182.6 (Louis 15/10/2026) — la FONCTION d'un contact rapprochée du sujet d'une offre = « contact proche de ce
// sujet (métier ou lieu) », jamais « manager » : un titre qui recoupe l'intitulé ne dit pas que la personne dirige ce poste.
describe('#4182.6 — contact proche du sujet d’une offre', () => {
  const offer = { text: 'Poste ouvert — Data engineer GCP', role: null, location: null, posting: true }

  it('un titre qui recoupe l’intitulé d’une offre rend « proche de ce sujet » (known), jamais « lié » (role)', () => {
    const result = proposeContactsForSignal({ contacts: [parisData], signal: offer, perimeter: france })
    expect(result.contacts.map(c => c.id)).toEqual(['fr-data'])
    expect(result.match).toBe('known')
  })

  it('le lieu de l’offre rapproche aussi : un contact au même lieu est proche du sujet', () => {
    const lyonSales = contact({ id: 'lyon-sales', title: 'Directeur commercial', location: 'Lyon, France' })
    const result = proposeContactsForSignal({
      contacts: [lyonSales],
      signal: { text: 'Poste ouvert — Ingénieur DevOps', role: null, location: 'Lyon', posting: true },
      perimeter: france,
    })
    expect(result.contacts.map(c => c.id)).toEqual(['lyon-sales'])
    expect(result.match).toBe('known')
  })

  it('SAIT DIRE NON — ni métier ni lieu en commun : personne n’est proposé', () => {
    const result = proposeContactsForSignal({
      contacts: [contact({ id: 'z', title: 'Directeur juridique', location: 'Lille, France' })],
      signal: { text: 'Poste ouvert — Data engineer GCP', role: null, location: 'Lyon', posting: true },
      perimeter: france,
    })
    expect(result).toEqual({ contacts: [], match: 'none' })
  })

  it('une personne NOMMÉE ou un rôle déclaré par la mission restent « liés » (role)', () => {
    const named = proposeContactsForSignal({
      contacts: [lyonCloud],
      signal: { ...offer, text: 'Sophie Martin recrute un architecte cloud' },
      perimeter: france,
    })
    expect(named.match).toBe('role')
  })
})

describe('#5031 (lot 763) — la raison précise de chaque contact proposé', () => {
  const offer = { text: 'Poste ouvert — Data engineer GCP', role: null, location: null, posting: true }

  it('nommé dans le texte ⇒ « named »', () => {
    const result = proposeContactsForSignal({
      contacts: [lyonCloud],
      signal: { ...offer, text: 'Sophie Martin recrute un architecte cloud' },
      perimeter: france,
    })
    expect(result.reasons?.['fr-cloud']).toEqual({ kind: 'named' })
  })

  it('mots du titre en commun ⇒ « craft » avec 2 mots au plus, dans l’écriture du titre du contact', () => {
    const result = proposeContactsForSignal({
      contacts: [contact({ id: 'd', full_name: 'Paul Durand', title: 'Directeur Data Engineering GCP' })],
      signal: { ...offer, text: 'Poste ouvert — Data engineer GCP BigQuery' },
      perimeter: france,
    })
    const reason = result.reasons?.['d']
    expect(reason?.kind).toBe('craft')
    if (reason?.kind === 'craft') {
      expect(reason.words.length).toBeGreaterThan(0)
      expect(reason.words.length).toBeLessThanOrEqual(2)
      expect(reason.words).toContain('Data')
    }
  })

  it('lieu en commun seul ⇒ « place » avec la ville du poste', () => {
    const lyonSales = contact({ id: 'lyon-sales', title: 'Directeur commercial', location: 'Lyon, France' })
    const result = proposeContactsForSignal({
      contacts: [lyonSales],
      signal: { text: 'Poste ouvert — Ingénieur DevOps', role: null, location: 'Lyon', posting: true },
      perimeter: france,
    })
    expect(result.reasons?.['lyon-sales']).toEqual({ kind: 'place', place: 'Lyon' })
  })

  it('rôle déclaré par le fait ⇒ « role » — jamais « manager du poste » (#4182.6)', () => {
    const result = proposeContactsForSignal({
      contacts: [parisData],
      signal: { text: 'Augmentation de capital', role: 'Directeur data', location: null },
      perimeter: france,
    })
    expect(result.reasons?.['fr-data']).toEqual({ kind: 'role' })
  })
})

describe('#5065 (lot 766) — recette prod 01/11 : « même métier » ne dit jamais un mot sans valeur', () => {
  const sales = (id: string, title: string, location = 'Paris, France') =>
    contact({ id, full_name: `Contact ${id}`, title, location })
  const reasonOf = (
    signal: { text: string; location?: string | null },
    contacts: ProposableContact[],
    accountName?: string,
  ) =>
    proposeContactsForSignal({
      contacts,
      signal: { role: null, location: null, posting: true, ...signal },
      perimeter: undefined,
      ...(accountName ? { accountName } : {}),
    })

  it('le nom du compte n’est jamais un « métier » commun, sous toutes ses formes', () => {
    const result = reasonOf(
      { text: 'Viveris recrute — Data engineer' },
      [sales('a', 'Directeur Viveris Conseil')],
      'VIVERIS',
    )
    expect(result.contacts).toEqual([])
  })

  it.each(['Secteur', 'Tech', 'Offre', 'Industrie', 'Projets', 'Projet', 'Poste', 'Équipe', 'Groupe', 'France', 'CDI'])(
    'le mot vide « %s » ne compte pas',
    word => {
      const result = reasonOf({ text: `${word} — Data engineer` }, [sales('a', `Directeur ${word}`)])
      expect(result.contacts).toEqual([])
    },
  )

  it('une ville n’est jamais « même métier » : lieu commun ⇒ « même lieu »', () => {
    const result = reasonOf({ text: 'Poste à Lyon — Data engineer', location: null }, [
      sales('lyon', 'Directeur Lyon Sud', 'Lyon, France'),
    ])
    expect(result.reasons?.['lyon']).toEqual({ kind: 'place', place: 'Lyon' })
  })

  it('le lieu du signal est exclu des mots de métier', () => {
    const result = reasonOf({ text: 'Data engineer Lyon', location: 'Lyon' }, [
      sales('l', 'Responsable Lyon', 'Nantes'),
    ])
    expect(result.contacts).toEqual([])
  })

  it('un vrai mot de métier survit aux mots vides', () => {
    const result = reasonOf(
      { text: 'Viveris — Secteur Tech — Data engineer' },
      [sales('d', 'Directeur Data Viveris Tech')],
      'Viveris',
    )
    const reason = result.reasons?.['d']
    expect(reason?.kind).toBe('craft')
    if (reason?.kind === 'craft') expect(reason.words).toEqual(['Data'])
  })
})
