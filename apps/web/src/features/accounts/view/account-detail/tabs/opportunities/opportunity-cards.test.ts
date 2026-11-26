import type { WatchSignal } from '@/features/accounts/model/watch'
import type { AccountMission, MissionContact } from './account-missions'
import { buildOpportunitySections, offersIn, placeOf, RECRUITMENT_SHOWN_FIRST, teamKeyOf } from './opportunity-cards'

/**
 * #4022 / #4020 (Louis 11/10) — UNE carte par fait, des sections dans l'ordre du dézoom :
 * recrutements d'abord (France → lieu non précisé → hors France, nommés avant non nommés),
 * besoins d'équipe agrégés, puis vision / transformation.
 */

function signal(overrides: Partial<WatchSignal> & Pick<WatchSignal, 'id' | 'signal'>): WatchSignal {
  return {
    category: 'recrutement',
    date: '2026-10-01',
    freshness: 'current',
    temporalStatus: 'RECENT',
    type: 'recrutement',
    source: "Offre d'emploi publiée",
    sourceUrl: null,
    sourceKind: null,
    perimeter: 'Doctolib',
    angles: [],
    actionGate: { allowed: true, reasons: [] } as unknown as WatchSignal['actionGate'],
    tags: [],
    location: null,
    ...overrides,
  }
}

const CTO: MissionContact = {
  id: 'c1',
  full_name: 'Jeanne Martin',
  title: 'Head of Data',
  email: 'j@x.fr',
  phone: null,
}
const DRH: MissionContact = { id: 'c2', full_name: 'Paul Durand', title: 'DRH', email: null, phone: null }

describe('placeOf — #4020, le lieu se lit, il ne se devine pas', () => {
  it('France : pays, ville, code postal ou département au format des offres', () => {
    expect(placeOf('Paris, France', '').rank).toBe('france')
    expect(placeOf('75 - PARIS 08', '').rank).toBe('france')
    expect(placeOf('Lyon', '').rank).toBe('france')
    expect(placeOf('Île-de-France', '').rank).toBe('france')
  })

  it('hors France : pays ou ville étrangère, même avec un code postal', () => {
    expect(placeOf('Berlin, Germany', '').rank).toBe('abroad')
    expect(placeOf('10115 Berlin', '').rank).toBe('abroad')
    expect(placeOf('Barcelona', '').rank).toBe('abroad')
  })

  it('sait dire NON : télétravail, texte inconnu ou rien → lieu non précisé', () => {
    expect(placeOf('Remote', '').rank).toBe('unknown')
    expect(placeOf(null, 'Data engineer (H/F)').rank).toBe('unknown')
    expect(placeOf('  ', '').place).toBeNull()
  })

  // OFFRES-VEILLE (16/10) — Decathlon : le lieu est vide mais le texte de l'offre cite Villeneuve-d'Ascq.
  it('lieu vide : lit la ville CITÉE dans le texte de l’offre (liste fermée / code postal)', () => {
    expect(placeOf(null, 'Data engineer', 'Poste basé à Villeneuve-d’Ascq, campus Decathlon').rank).toBe('france')
    expect(placeOf(null, 'Data engineer', 'Site de 59650 Villeneuve').rank).toBe('france')
    expect(placeOf(null, 'Data engineer — Villeneuve-d’Ascq').rank).toBe('france')
  })

  it('lieu vide et AUCUNE ville citée : « lieu non précisé » reste', () => {
    expect(placeOf(null, 'Data engineer', 'Poste en équipe produit, 3 ans d’expérience, 45 000 €').rank).toBe('unknown')
    expect(placeOf(null, 'Data engineer', null).rank).toBe('unknown')
  })

  it('sans lieu collecté, lit un lieu EXPLICITE dans l’intitulé de l’offre', () => {
    expect(placeOf(null, 'Senior Backend Engineer - London').rank).toBe('abroad')
    expect(placeOf(null, 'Ingénieur DevOps - Nantes').rank).toBe('france')
    // « BNP Paribas » n'est pas Paris : la lecture se fait par mot entier.
    expect(placeOf(null, 'Consultant chez BNP Paribas').rank).toBe('unknown')
  })
})

describe('teamKeyOf — l’équipe / la techno d’un poste, vocabulaire fermé', () => {
  it('regroupe par famille, rien quand aucune famille ne se lit', () => {
    expect(teamKeyOf('Data engineer GCP')).toBe('data')
    expect(teamKeyOf('Data analyst')).toBe('data')
    expect(teamKeyOf('Ingénieur DevOps Kubernetes')).toBe('cloud')
    expect(teamKeyOf('Comptable')).toBeNull()
  })

  // #4399 (recette 21/10, L6) — les familles courantes d'une ESN.
  it.each([
    ['Développeur Java Spring', 'java'],
    ['Développeur full stack', 'dev'],
    ['Ingénieur logiciel embarqué', 'dev'],
    ['Consultant ERP Oracle', 'erp'],
    ['Chef de projet PMO', 'project'],
    ['Technicien support helpdesk', 'support'],
    ['Ingénieur test QA', 'qa'],
    ['Ingénieur réseau télécom', 'network'],
    ['Ingénieur process industriel', 'industry'],
    ['Automaticien maintenance électrique', 'industry'],
    ['Architecte cloud AWS', 'cloud'],
    ['Analyste cybersécurité SOC', 'security'],
  ])('%s → %s', (title, family) => {
    expect(teamKeyOf(title)).toBe(family)
  })
})

describe('buildOpportunitySections — #4399.2 (22/10) : « Besoins d’équipe » dès qu’il y a une offre du métier', () => {
  it('sept offres de quatre familles ⇒ une famille par groupe, chacune liste ses postes (plus de seuil de 2)', () => {
    const sections = buildOpportunitySections({
      signals: [
        signal({ id: 's1', signal: 'Data engineer' }),
        signal({ id: 's2', signal: 'Data analyst' }),
        signal({ id: 's3', signal: 'Ingénieur DevOps' }),
        signal({ id: 's4', signal: 'Architecte cloud AWS' }),
        signal({ id: 's5', signal: 'Développeur Java' }),
        signal({ id: 's6', signal: 'Ingénieur Java Spring' }),
        signal({ id: 's7', signal: 'Consultant ERP' }),
      ],
      missions: [],
      contacts: [],
    })
    expect(sections.team.map(team => team.teamKey).sort()).toEqual(['cloud', 'data', 'erp', 'java'])
    expect(sections.team.reduce((sum, team) => sum + team.postings.length, 0)).toBe(7)
    expect(sections.recruitment).toHaveLength(7)
  })

  it('Airbus : des offres du même intitulé dans plusieurs villes (repliées en UNE carte) font un groupe, et comptent N offres', () => {
    const sections = buildOpportunitySections({
      signals: [
        signal({ id: 'a1', signal: 'Chef de projet systèmes', location: 'Toulouse' }),
        signal({ id: 'a2', signal: 'Chef de projet systèmes', location: 'Blagnac' }),
        signal({ id: 'a3', signal: 'Chef de projet systèmes', location: 'Hambourg' }),
      ],
      missions: [],
      contacts: [],
    })
    expect(sections.team).toHaveLength(1)
    expect(sections.team[0]?.teamKey).toBe('project')
    expect(offersIn(sections.team[0]!)).toBe(3)
  })

  it('une offre dont aucune famille ne se lit tombe dans « Autres postes » (listée, jamais perdue), en dernier', () => {
    const sections = buildOpportunitySections({
      signals: [
        signal({ id: 'o1', signal: 'Responsable de site' }),
        signal({ id: 'o2', signal: 'Data engineer' }),
        signal({ id: 'o3', signal: 'Data analyst' }),
      ],
      missions: [],
      contacts: [],
    })
    expect(sections.team.map(team => team.teamKey)).toEqual(['data', 'other'])
    expect(sections.team[1]?.postings.map(posting => posting.title)).toEqual(['Responsable de site'])
  })

  it('NON : sans aucune offre, aucune section', () => {
    expect(buildOpportunitySections({ signals: [], missions: [], contacts: [] }).team).toEqual([])
  })
})

describe('buildOpportunitySections — #4022', () => {
  it('trie les recrutements France → lieu non précisé → hors France, jamais supprimés', () => {
    const sections = buildOpportunitySections({
      signals: [
        signal({ id: 's1', signal: 'Comptable', location: 'Berlin' }),
        signal({ id: 's2', signal: 'Juriste', location: null }),
        signal({ id: 's3', signal: 'Acheteur', location: 'Lyon' }),
      ],
      missions: [],
      contacts: [],
    })
    expect(sections.recruitment.map(card => card.title)).toEqual(['Acheteur', 'Juriste', 'Comptable'])
    expect(sections.recruitment.map(card => card.place?.rank)).toEqual(['france', 'unknown', 'abroad'])
  })

  it('une carte avec une personne liée passe avant une carte sans personne du même rang', () => {
    const sections = buildOpportunitySections({
      signals: [
        signal({ id: 's1', signal: 'Comptable', location: 'Paris', date: '2026-10-05' }),
        signal({ id: 's2', signal: 'Responsable Data Office', location: 'Paris', date: '2026-09-01' }),
        signal({ id: 's3', signal: 'Juriste', location: 'Madrid' }),
      ],
      missions: [],
      contacts: [CTO, DRH],
    })
    expect(sections.recruitment.map(card => card.title)).toEqual(['Responsable Data Office', 'Comptable', 'Juriste'])
    expect(sections.recruitment[0]?.contacts.map(contact => contact.id)).toEqual(['c1'])
    // Sans personne liée : la carte reste, sans contact inventé.
    expect(sections.recruitment[1]?.contacts).toEqual([])
    expect(sections.recruitment[1]?.contactsMatch).toBe('none')
  })

  it('un intitulé générique (« ingénieur ») ne lie personne', () => {
    const sections = buildOpportunitySections({
      signals: [signal({ id: 's1', signal: 'Ingénieur commercial senior' })],
      missions: [],
      contacts: [{ ...CTO, title: 'Ingénieur senior' }],
    })
    expect(sections.recruitment[0]?.contacts).toEqual([])
  })

  it('#4022 (Louis 11/10) — plusieurs postes d’une équipe forment UN résumé d’équipe, SANS retirer aucun poste de ①', () => {
    const sections = buildOpportunitySections({
      signals: [
        signal({ id: 's1', signal: 'Data engineer', location: 'Paris' }),
        signal({ id: 's2', signal: 'Data analyst', location: 'Berlin' }),
        signal({ id: 's3', signal: 'Comptable' }),
      ],
      missions: [],
      contacts: [],
    })
    // Tous les postes restent en ①, dans le tri existant : France → lieu non précisé → hors France.
    expect(sections.recruitment.map(card => card.title)).toEqual(['Data engineer', 'Comptable', 'Data analyst'])
    // #4399.2 — « Comptable » (aucune famille lue) n'est plus perdu : il se liste sous « Autres postes ».
    expect(sections.team.map(team => team.teamKey)).toEqual(['data', 'other'])
    expect(sections.team[0]?.postings.map(posting => posting.title)).toEqual(['Data engineer', 'Data analyst'])
  })

  it('les autres signaux vont dans « Vision / transformation », du plus récent au plus ancien', () => {
    const sections = buildOpportunitySections({
      signals: [
        signal({
          id: 's1',
          signal: 'Levée de 50 M€',
          category: 'historique',
          type: 'levee_fonds',
          source: 'Les Echos',
          date: '2026-01-01',
        }),
        signal({
          id: 's2',
          signal: 'Paul Durand nommé DSI',
          source: 'Les Echos',
          category: 'nomination',
          type: 'nomination',
          date: '2026-09-01',
        }),
      ],
      missions: [],
      contacts: [DRH],
    })
    expect(sections.recruitment).toEqual([])
    expect(sections.vision.map(card => card.title)).toEqual(['Paul Durand nommé DSI', 'Levée de 50 M€'])
    // La personne NOMMÉE dans le fait est liée, par son nom.
    expect(sections.vision[0]?.contacts.map(contact => contact.id)).toEqual(['c2'])
  })

  it('un fait = une carte : la mission fondée sur un signal le reprend, avec ses contacts', () => {
    const mission: AccountMission = {
      key: 'lead-1',
      title: 'Renfort comptabilité',
      basis: { label: 'Comptable', source: "Offre d'emploi publiée", observed_on: '2026-10-01' },
      role: 'DRH',
      origin: 'lead',
      contacts: [DRH],
      contacts_match: 'role',
    }
    const sections = buildOpportunitySections({
      signals: [signal({ id: 's1', signal: 'Comptable', location: 'Lyon' })],
      missions: [mission],
      contacts: [DRH],
    })
    expect(sections.recruitment).toHaveLength(1)
    expect(sections.recruitment[0]?.title).toBe('Renfort comptabilité')
    expect(sections.recruitment[0]?.basis.label).toBe('Comptable')
    expect(sections.recruitment[0]?.place?.rank).toBe('france')
    expect(sections.recruitment[0]?.contacts.map(contact => contact.id)).toEqual(['c2'])
  })

  it('une mission sans signal correspondant garde sa carte, rangée par la nature de son fait', () => {
    const mission: AccountMission = {
      key: 'opp-1',
      title: 'Migration cloud',
      basis: { label: 'Programme de migration vers le cloud', source: 'Presse', observed_on: '2026-09-10' },
      role: null,
      origin: 'opportunity',
      contacts: [],
      contacts_match: 'none',
    }
    const sections = buildOpportunitySections({ signals: [], missions: [mission], contacts: [] })
    expect(sections.vision.map(card => card.key)).toEqual(['opp-1'])
  })

  // #4329.1 (call refonte UX 19/10 — « trop de projets plausibles », 61 cartes ③ le 11/10) — un projet
  // POSSIBLE (piste non confirmée) sans signal correspondant ne fait plus de carte ③ : il vit, une fois,
  // dans la file « Projets possibles, à confirmer » (seuil de preuve, décisions). Une affaire ouverte, si.
  it('#4329.1 — une piste sans signal ne fait PAS de carte vision ; une affaire ouverte, si', () => {
    const lead: AccountMission = {
      key: 'lead-9',
      title: 'Modernisation du SI',
      basis: { label: 'Ambition 2030 — modernisation du SI', source: 'Rapport annuel', observed_on: '2026-09-10' },
      role: null,
      origin: 'lead',
      contacts: [],
      contacts_match: 'none',
    }
    const opportunity: AccountMission = { ...lead, key: 'opp-9', origin: 'opportunity' }
    const sections = buildOpportunitySections({ signals: [], missions: [lead, opportunity], contacts: [] })
    expect(sections.vision.map(card => card.key)).toEqual(['opp-9'])
  })

  it('#4329.1 — sait dire NON : une piste fondée sur un SIGNAL garde la carte de ce signal', () => {
    const lead: AccountMission = {
      key: 'lead-10',
      title: 'Plan stratégique',
      basis: { label: 'Plan stratégique 2030', source: 'Presse', observed_on: '2026-10-01' },
      role: null,
      origin: 'lead',
      contacts: [],
      contacts_match: 'none',
    }
    const sections = buildOpportunitySections({
      signals: [
        signal({ id: 's9', signal: 'Plan stratégique 2030', category: 'budget', type: 'projet', source: 'Presse' }),
      ],
      missions: [lead],
      contacts: [],
    })
    expect(sections.vision.map(card => card.key)).toEqual(['lead-10'])
  })

  it('rien à montrer : toutes les sections vides', () => {
    const sections = buildOpportunitySections({ signals: [], missions: [], contacts: [] })
    expect(sections).toEqual({ recruitment: [], otherRecruitment: [], team: [], otherNeeds: [], vision: [] })
  })

  it('montre 5 recrutements d’abord', () => {
    expect(RECRUITMENT_SHOWN_FIRST).toBe(5)
  })
})

describe('buildOpportunitySections — #4022 recette prod 12/10', () => {
  it('#4022.3 — une offre d’emploi typée autrement (source « Offre d’emploi », kind job) reste en recrutement, jamais en vision', () => {
    const sections = buildOpportunitySections({
      signals: [
        signal({ id: 's1', signal: 'Team Manager CS', category: 'historique', type: 'historique' }),
        signal({
          id: 's2',
          signal: 'B2B Sales Manager (x/f/m) im Außendienst',
          category: 'historique',
          type: 'historique',
          source: 'Autre',
          sourceKind: 'job',
        }),
      ],
      missions: [],
      contacts: [],
    })
    expect(sections.vision).toEqual([])
    expect(sections.recruitment.map(card => card.title).sort()).toEqual([
      'B2B Sales Manager (x/f/m) im Außendienst',
      'Team Manager CS',
    ])
  })

  it('#4022.3 — un même article (même URL, ou même titre + même source) ne fait qu’UNE carte', () => {
    const base = { category: 'historique' as const, type: 'historique', source: 'Franceinfo' }
    const sections = buildOpportunitySections({
      signals: [
        signal({
          id: 's1',
          signal: 'Doctolib lève des fonds',
          ...base,
          sourceUrl: 'https://f.info/a',
          date: '2026-10-01',
        }),
        signal({
          id: 's2',
          signal: 'Doctolib lève des fonds !',
          ...base,
          sourceUrl: 'https://f.info/a',
          date: '2026-10-02',
        }),
        signal({ id: 's3', signal: 'DOCTOLIB lève des fonds', ...base, sourceUrl: null, date: '2026-10-03' }),
        signal({ id: 's4', signal: 'Doctolib lève des fonds', ...base, source: 'Les Echos', date: '2026-10-03' }),
      ],
      missions: [],
      contacts: [],
    })
    // s1+s2 (même URL), s3 = même titre normalisé que s1, s4 = même texte chez une autre source (#4022, recette
    // prod 12/10 : « le même texte presse apparaît 2 fois ») : tout est UN seul fait.
    expect(sections.vision).toHaveLength(1)
    expect(sections.vision[0]?.basis.source).toBe('Franceinfo')
  })

  it('#4022 — le même texte presse repris par deux sources, ou par un signal et une mission, ne fait qu’UNE carte', () => {
    const text = 'Barbara Martin Coppola a présenté une refonte du modèle logistique'
    const mission: AccountMission = {
      key: 'opp-9',
      title: 'Refonte logistique',
      basis: { label: text, source: 'Les Echos (autre libellé)', observed_on: '2026-10-02' },
      role: null,
      origin: 'opportunity',
      contacts: [],
      contacts_match: 'none',
    }
    const press = { category: 'historique' as const, type: 'historique' }
    const sections = buildOpportunitySections({
      signals: [
        signal({ id: 'p1', signal: text, source: 'Le Monde', ...press }),
        signal({ id: 'p2', signal: `${text}.`, source: 'Capital', ...press }),
      ],
      missions: [mission],
      contacts: [],
    })
    expect(sections.vision).toHaveLength(1)
  })

  // V4-CORRECTIFS-C 4294.6 (#4142.5) renverse #4022 : deux villes, même intitulé = UNE carte « 2 offres (Paris, Lyon) ».
  it('#4142.5 — deux offres au même intitulé dans deux villes sont UNE carte, les deux villes gardées', () => {
    const sections = buildOpportunitySections({
      signals: [
        signal({ id: 'j1', signal: 'Data engineer', location: 'Paris' }),
        signal({ id: 'j2', signal: 'Data engineer', location: 'Lyon' }),
      ],
      missions: [],
      contacts: [],
    })
    expect(sections.recruitment).toHaveLength(1)
    expect(sections.recruitment[0]).toMatchObject({ offerCount: 2, offerPlaces: ['Paris', 'Lyon'] })
  })

  it('#4022.1 — des postes de vente / support client forment un besoin d’équipe', () => {
    const sections = buildOpportunitySections({
      signals: [
        signal({ id: 's1', signal: 'B2B Sales Manager', location: 'Paris' }),
        signal({ id: 's2', signal: 'Sales Executive Mid-Market', location: 'Lyon' }),
        signal({ id: 's3', signal: 'Customer Success Manager', location: 'Paris' }),
        signal({ id: 's4', signal: 'Team Manager CS', location: 'Paris' }),
      ],
      missions: [],
      contacts: [],
    })
    expect(sections.team.map(team => team.teamKey).sort()).toEqual(['cs', 'sales'])
  })

  it('#4044.1 — chaque carte porte SES contacts recoupés, aucun bloc générique partagé', () => {
    const base: AccountMission = {
      key: 'm1',
      title: 'Mission X',
      basis: { label: 'Fait X', source: 'Presse', observed_on: '2026-09-10' },
      role: null,
      origin: 'opportunity',
      contacts: [CTO],
      contacts_match: 'known',
    }
    const other: AccountMission = {
      ...base,
      key: 'm2',
      title: 'Mission Y',
      basis: { ...base.basis, label: 'Fait Y' },
      contacts: [DRH],
    }
    const none: AccountMission = {
      ...base,
      key: 'm3',
      title: 'Mission Z',
      basis: { ...base.basis, label: 'Fait Z' },
      contacts: [],
      contacts_match: 'none',
    }
    const sections = buildOpportunitySections({ signals: [], missions: [base, other, none], contacts: [CTO, DRH] })
    expect('knownContacts' in sections).toBe(false)
    const byKey = new Map(sections.vision.map(card => [card.key, card]))
    expect(byKey.get('m1')?.contacts.map(contact => contact.id)).toEqual(['c1'])
    expect(byKey.get('m2')?.contacts.map(contact => contact.id)).toEqual(['c2'])
    expect(byKey.get('m3')?.contacts).toEqual([])
    expect(byKey.get('m3')?.contactsMatch).toBe('none')
  })
})

describe('#3916 — deux annonces légales de même libellé, de dates différentes, sont deux cartes', () => {
  const legal = (id: string, date: string, url: string) =>
    signal({
      id,
      category: 'historique',
      type: 'legal',
      signal: 'Modifications diverses — ELECTRICITE DE FRANCE',
      source: 'BODACC',
      date,
      sourceUrl: url,
      sourceKind: 'bodacc',
    })

  it('garde l’annonce du 09/08 à côté de celle du 12/10, chacune avec son lien', () => {
    const { vision } = buildOpportunitySections({
      signals: [
        legal('a', '2026-10-12', 'https://www.bodacc.fr/a/12'),
        legal('b', '2026-08-09', 'https://www.bodacc.fr/a/09'),
      ],
      missions: [],
      contacts: [],
    })
    expect(vision.map(card => card.basis.sourceUrl)).toEqual([
      'https://www.bodacc.fr/a/12',
      'https://www.bodacc.fr/a/09',
    ])
  })

  it('une même annonce lue deux fois (même date) reste une seule carte', () => {
    const { vision } = buildOpportunitySections({
      signals: [
        legal('a', '2026-10-12', 'https://www.bodacc.fr/a/12'),
        legal('b', '2026-10-12', 'https://www.bodacc.fr/a/12'),
      ],
      missions: [],
      contacts: [],
    })
    expect(vision).toHaveLength(1)
  })
})

describe('#3901.6 — postes visés d’abord, les autres recrutements dessous, jamais mélangés', () => {
  const profile = { placedRoles: ['Data engineer'], noGoSectors: [] }
  const sigs = [
    signal({ id: 'a', signal: 'Poste ouvert — Data engineer GCP' }),
    signal({ id: 'b', signal: 'Poste ouvert — Comptable fournisseurs' }),
    signal({ id: 'c', signal: 'Poste ouvert — Data engineer Spark' }),
  ]
  const build = (p?: typeof profile) =>
    buildOpportunitySections({ signals: sigs, missions: [], contacts: [], ...(p ? { profile: p } : {}) })

  it('le poste visé reste en ①, l’autre passe sous « autres recrutements »', () => {
    const out = build(profile)
    expect(out.recruitment.map(c => c.key)).toEqual(expect.arrayContaining(['a', 'c']))
    expect(out.recruitment.map(c => c.key)).not.toContain('b')
    expect(out.otherRecruitment.map(c => c.key)).toEqual(['b'])
  })

  it('SAIT DIRE NON — sans poste visé déclaré, aucune séparation : rien n’est déclaré « autre »', () => {
    const out = build()
    expect(out.otherRecruitment).toEqual([])
    expect(out.recruitment).toHaveLength(3)
  })

  it('SAIT DIRE NON — un espace qui place des CDI pour ses clients garde toutes les offres ensemble', () => {
    // #3901.7 (18/10) — une offre comptable sort du métier d'un placeur : l'offre non visée est ici une offre IT.
    const itSigs = sigs.map(s => (s.id === 'b' ? signal({ id: 'b', signal: 'Poste ouvert — Développeur Java' }) : s))
    const out = buildOpportunitySections({
      signals: itSigs,
      missions: [],
      contacts: [],
      profile: { ...profile, recruitsForClients: true } as typeof profile,
    })
    expect(out.otherRecruitment).toEqual([])
    expect(out.recruitment).toHaveLength(3)
  })
})

describe('OFFRES-VEILLE (16/10) — une offre = une carte, ses besoins déduits dessous', () => {
  const CEO: MissionContact = {
    id: 'c9',
    full_name: 'Zoé Lenoir',
    title: 'Design Leader CEO Office',
    email: null,
    phone: null,
  }
  const CFO: MissionContact = { id: 'c10', full_name: 'Marc Petit', title: 'Real Estate CFO', email: null, phone: null }
  const OFFER = 'Measurement and Data Marketing Manager'
  const deduced = (key: string, title: string): AccountMission => ({
    key,
    title,
    basis: { label: `${OFFER} (H/F)`, source: 'Offre déduite', observed_on: '2026-10-01' },
    role: 'CEO',
    origin: 'lead',
    contacts: [CEO, CFO],
    contacts_match: 'role',
  })

  it('les difficultés déduites d’une offre se rangent SOUS la carte de l’offre, jamais en cartes à part', () => {
    const sections = buildOpportunitySections({
      signals: [signal({ id: 's1', signal: OFFER, location: "Villeneuve-d'Ascq" })],
      missions: [deduced('m1', 'Pilotage de la donnée marketing'), deduced('m2', 'Mesure de la performance')],
      contacts: [CEO, CFO],
    })
    expect(sections.recruitment).toHaveLength(1)
    expect(sections.vision).toHaveLength(0)
    expect(sections.recruitment[0]?.derivedNeeds).toEqual([
      'Pilotage de la donnée marketing',
      'Mesure de la performance',
    ])
  })

  it('SAIT DIRE NON — ni le métier ni le lieu de l’offre ne recoupent ces personnes : aucun contact, jamais les mêmes 2 par défaut', () => {
    const sections = buildOpportunitySections({
      signals: [signal({ id: 's1', signal: OFFER, location: "Villeneuve-d'Ascq" })],
      missions: [deduced('m1', 'Pilotage de la donnée marketing')],
      contacts: [CEO, CFO],
    })
    expect(sections.recruitment[0]?.contacts).toEqual([])
    expect(sections.recruitment[0]?.contactsMatch).toBe('none')
  })

  it('une mission qui ne parle PAS de l’offre garde sa carte', () => {
    // #4329.1 — une AFFAIRE ouverte (une piste non confirmée vit dans la file des projets possibles).
    const other: AccountMission = {
      ...deduced('m3', 'Migration'),
      origin: 'opportunity',
      basis: { label: 'Programme cloud', source: 'Presse', observed_on: '2026-09-10' },
    }
    const sections = buildOpportunitySections({
      signals: [signal({ id: 's1', signal: OFFER })],
      missions: [other],
      contacts: [],
    })
    expect(sections.recruitment[0]?.derivedNeeds).toEqual([])
    expect(sections.vision.map(card => card.key)).toEqual(['m3'])
  })
})

// #3917.r42 — recette prod R42 : l'analyse pose la date en TEXTE (« 12 octobre 2026 »), pas en ISO ;
// la carte la jetait, les 6 actualités de Thales s'affichaient sans date.
describe('date de publication des actualités — #3917.r42', () => {
  const build = (signals: WatchSignal[]) =>
    buildOpportunitySections({
      signals,
      missions: [],
      contacts: [],
      perimeter: null,
    } as unknown as Parameters<typeof buildOpportunitySections>[0])

  const press = (id: string, date: string, text: string) =>
    signal({ id, signal: text, date, category: 'budget', type: 'projet', source: 'Boursorama', sourceKind: 'press' })

  it('lit une date française « 12 octobre 2026 » et « 5 mai 2026 » en jour ISO', () => {
    const { vision } = build([
      press('a', '12 octobre 2026', 'Base de maintenance au Japon'),
      press('b', '5 mai 2026', 'Contrat Thales Alenia Space'),
      press('c', '1er février 2025', 'Rapport cyber'),
    ])
    const byId = Object.fromEntries(vision.map(card => [card.key, card.basis.date]))
    expect(byId).toEqual({ a: '2026-10-12', b: '2026-05-05', c: '2025-02-01' })
  })

  it('sait dire NON : texte sans jour exact → aucune date inventée', () => {
    const { vision } = build([
      press('a', 'Non datée dans la page scrapée ; article consulté récemment', 'Nomination'),
      press('b', 'Il y a environ une semaine ; date exacte non fournie', 'Batterie 15 MW'),
      press('c', 'mars 2026', 'Plan stratégique'),
      press('d', '2025, projet annoncé le 17 novembre 2025', 'Stratégie IA'),
    ])
    expect(vision.map(card => card.basis.date)).toEqual([null, null, null, null])
  })
})

// V4-CORRECTIFS-C 4294.6 (#4142.5) — le repli « même intitulé » vit aussi dans l'onglet Signaux (cartes d'offres).
describe('4294.6 — deux offres au même intitulé = UNE carte « N offres (villes) »', () => {
  const offer = (id: string, title: string, location: string) =>
    signal({ id, signal: title, location, sourceKind: 'job' })
  const run = (signals: WatchSignal[]) => buildOpportunitySections({ signals, missions: [], contacts: [] })

  it('replie les offres au même intitulé normalisé, villes listées', () => {
    const out = run([
      offer('a', 'Senior Consultant Stratégie DATA / IA', 'Toulouse'),
      offer('b', 'Senior consultant Stratégie Data et IA', 'Aix-en-Provence'),
    ])
    expect(out.recruitment).toHaveLength(1)
    expect(out.recruitment[0]).toMatchObject({ offerCount: 2 })
    expect(out.recruitment[0]?.offerPlaces).toEqual(['Toulouse', 'Aix-en-Provence'])
  })

  // Recette 21/10 K3 — `distinctWatchEvents` replie désormais les offres en amont : la carte garde le compte.
  it('une offre déjà repliée en amont garde son nombre et ses villes', () => {
    const out = run([
      {
        ...offer('a', 'Senior Consultant Stratégie DATA / IA', 'Toulouse'),
        offerCount: 2,
        offerPlaces: ['Toulouse', 'Aix-en-Provence'],
      },
    ])
    expect(out.recruitment).toHaveLength(1)
    expect(out.recruitment[0]).toMatchObject({ offerCount: 2, offerPlaces: ['Toulouse', 'Aix-en-Provence'] })
  })

  it('sait dire NON : deux intitulés différents restent deux cartes', () => {
    const out = run([offer('a', 'Data engineer', 'Lyon'), offer('b', 'Chef de projet SI', 'Lyon')])
    expect(out.recruitment).toHaveLength(2)
    expect(out.recruitment.every(card => card.offerCount === undefined)).toBe(true)
  })
})

// #4399.2 (recette prod 23/10, Veolia) — les postes ouverts qui ne forment pas une équipe n'apparaissaient nulle part
// dans « Besoins d'équipe » : « Autres besoins » les regroupe par famille de métier, sous les équipes.
describe('buildOpportunitySections — #4399.2 autres besoins', () => {
  const sections = buildOpportunitySections({
    signals: [
      signal({ id: 's1', signal: 'Data engineer' }),
      signal({ id: 's2', signal: 'Data analyst' }),
      signal({ id: 's3', signal: 'Consultant ERP' }),
      signal({ id: 's4', signal: 'Ingénieur DevOps' }),
      signal({ id: 's5', signal: 'Comptable' }),
    ],
    missions: [],
    contacts: [],
  })

  // Intégration PR10 : le lot F1 (#4399.2) fait de CHAQUE famille lue un groupe d'équipe (une offre suffit, et « other »
  // pour les postes sans famille) — donc plus aucun poste ne reste « hors équipe » : `otherNeeds` est le filet, vide.
  it('chaque poste se range dans une équipe par famille ; un poste sans famille tombe dans « other »', () => {
    expect(sections.team.map(team => [team.teamKey, team.postings.length]).sort()).toEqual([
      ['cloud', 1],
      ['data', 2],
      ['erp', 1],
      ['other', 1],
    ])
    expect(sections.otherNeeds).toEqual([])
  })

  it('aucun poste ne figure à la fois dans une équipe et dans les autres besoins', () => {
    const inTeams = new Set(sections.team.flatMap(team => team.postings.map(posting => posting.key)))
    const inOthers = sections.otherNeeds.flatMap(group => group.postings.map(posting => posting.key))
    expect(inOthers.some(key => inTeams.has(key))).toBe(false)
  })

  it('tout est regroupé en équipes ⇒ aucun autre besoin (on n’affiche pas ce qu’on n’a pas)', () => {
    const grouped = buildOpportunitySections({
      signals: [signal({ id: 's1', signal: 'Data engineer' }), signal({ id: 's2', signal: 'Data analyst' })],
      missions: [],
      contacts: [],
    })
    expect(grouped.otherNeeds).toEqual([])
  })
})

// #4399.2 (recette prod 23/10, Decathlon) — « Autres métiers — 3 postes ouverts » paraissait deux fois (Besoins
// d'équipe ET Autres besoins) et comptait des items qui ne sont pas des postes (cartes d'affaires/missions).
describe('buildOpportunitySections — #4399.2 une seule section « Autres métiers », seuls les postes comptés', () => {
  const openDeal: AccountMission = {
    key: 'deal-1',
    title: 'Recrutement de talents — renfort',
    basis: { label: 'Recrutement de talents en cours', source: 'CRM', observed_on: '2026-09-10' },
    role: null,
    origin: 'opportunity',
    contacts: [],
    contacts_match: 'none',
  }

  it('OUI : les postes sans famille font UN groupe « other », compté sur les seules offres', () => {
    const out = buildOpportunitySections({
      signals: [signal({ id: 's1', signal: 'Comptable' }), signal({ id: 's2', signal: 'Gestionnaire de paie' })],
      missions: [openDeal],
      contacts: [],
    })
    const otherTeams = out.team.filter(entry => entry.teamKey === 'other')
    expect(otherTeams).toHaveLength(1)
    expect(offersIn(otherTeams[0]!)).toBe(2)
  })

  it('NON : une carte qui n’est pas une offre (affaire, mission) ne crée jamais « Autres besoins »', () => {
    const out = buildOpportunitySections({
      signals: [signal({ id: 's1', signal: 'Comptable' })],
      missions: [openDeal],
      contacts: [],
    })
    expect(out.otherNeeds).toEqual([])
  })
})

// #4396.1 (recette 23/10) — « Offres d'emploi · France » est la ligne d'une SOURCE, pas une offre : sans intitulé de
// poste, elle ne fait pas de carte (on n'affiche pas ce qu'on n'a pas).
describe('#4396.1 — la ligne générique sans intitulé n’est pas une offre', () => {
  it('« Offres d’emploi · France » ne fait aucune carte ; une vraie offre, si', () => {
    const sections = buildOpportunitySections({
      signals: [
        signal({ id: 'g', signal: 'Offres d’emploi · France' }),
        signal({ id: 'a', signal: 'Développeur Java (H/F)' }),
      ],
      missions: [],
      contacts: [],
    })
    expect(sections.recruitment.map(card => card.basis.label)).toEqual(['Développeur Java (H/F)'])
  })
})

// #4294.6 — des faits répétés se REGROUPENT en une ligne qui dit combien de fois ils ont été vus (aucun signal supprimé
// en base : seul l'affichage replie, et il le DIT).
describe('4294.6 — un fait répété = UNE carte « vu N fois »', () => {
  const news = (id: string, text: string, date = '2026-10-01') =>
    signal({ id, signal: text, category: 'budget', type: 'Budget', date, source: 'Les Echos' })
  const run = (signals: WatchSignal[]) => buildOpportunitySections({ signals, missions: [], contacts: [] })

  it('deux signaux au texte identique : une carte, seenCount = 2', () => {
    const out = run([
      news('a', 'Veolia : après 20 % de baisse, le titre rebondit'),
      news('b', 'Veolia : après 20 % de baisse, le titre rebondit', '2026-10-20'),
    ])
    expect(out.vision).toHaveLength(1)
    expect(out.vision[0]?.seenCount).toBe(2)
  })

  it('deux signaux quasi identiques, mêmes dates : une carte, seenCount = 2', () => {
    const out = run([
      news('a', 'Veolia : après 20 % de baisse, le titre rebondit en Bourse'),
      news('b', 'Veolia : après 20 % de baisse, le titre rebondit en Bourse mardi'),
    ])
    expect(out.vision).toHaveLength(1)
    expect(out.vision[0]?.seenCount).toBe(2)
  })

  it('trois occurrences : seenCount = 3', () => {
    const text = 'Veolia relève ses objectifs 2027'
    expect(run([news('a', text), news('b', text), news('c', text)]).vision[0]?.seenCount).toBe(3)
  })

  it('sait dire NON : deux faits différents restent deux cartes, sans compteur', () => {
    const out = run([
      news('a', 'Veolia rachète une usine en Pologne'),
      news('b', 'Veolia nomme un nouveau directeur IT'),
    ])
    expect(out.vision).toHaveLength(2)
    expect(out.vision.every(card => card.seenCount === undefined)).toBe(true)
  })

  it('une carte vue une fois ne porte pas de compteur', () => {
    expect(run([news('a', 'Veolia relève ses objectifs 2027')]).vision[0]?.seenCount).toBeUndefined()
  })

  it('« 5 offres d’emploi » dit deux fois dans le recrutement : une carte, seenCount = 2', () => {
    const out = run([
      signal({ id: 'a', signal: '5 offres d’emploi ouvertes chez Veolia' }),
      signal({ id: 'b', signal: '5 offres d’emploi ouvertes chez Veolia' }),
    ])
    expect(out.recruitment).toHaveLength(1)
    expect(out.recruitment[0]?.seenCount).toBe(2)
  })
})
