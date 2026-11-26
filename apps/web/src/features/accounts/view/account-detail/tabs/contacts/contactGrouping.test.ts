import { orgGraphSchema, type Contact, type OrgGraph } from '@bellum/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import {
  buildContactLevelMap,
  filterContacts,
  getContactPersona,
  getPriorityContacts,
  groupContacts,
  probableDuplicateLinks,
} from './contactGrouping'

function contactWith(extra: Partial<Contact>): Contact {
  return { id: 'c1', account_id: 'a1', full_name: 'Amina Benali', ...extra } as Contact
}

const ranked = (full_name: string, priority: number | null): Contact =>
  ({ id: full_name, account_id: 'a1', full_name, entity: 'EDF', priority }) as unknown as Contact

// The EDF priority path exactly as production returned it.
const EDF = [
  ranked('Vincent Niebel', 5),
  ranked('Patrick Charignon', 4),
  ranked('Olivier Ligneul', 2),
  ranked('Franck Michon', 1),
]
const EDF_BEST_FIRST = ['Franck Michon', 'Olivier Ligneul', 'Patrick Charignon', 'Vincent Niebel']

describe('getPriorityContacts', () => {
  it('puts the highest priority (rank 1) FIRST under "à engager en premier"', () => {
    // Regression: the list was sorted descending, so the card reading
    // « pertinence très limitée » (rank 5) came first and the
    // « décideur opérationnel direct » (rank 1) came last.
    expect(getPriorityContacts(EDF).map(c => c.full_name)).toEqual(EDF_BEST_FIRST)
  })

  it('Théo comptes-fiche — « Par qui commencer » garde jusqu’à 10 personnes, pas 4', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => ranked(`c${i}`, (i % 5) + 1))
    expect(getPriorityContacts(twelve)).toHaveLength(10)
    expect(getPriorityContacts(twelve.slice(0, 7))).toHaveLength(7)
  })

  it('lists unranked contacts after ranked ones', () => {
    expect(getPriorityContacts([ranked('unranked', null), ranked('best', 1)]).map(c => c.full_name)).toEqual([
      'best',
      'unranked',
    ])
  })
})

describe('groupContacts', () => {
  it('orders each group best-first too, so both views agree', () => {
    expect(groupContacts(EDF, 'entity')[0]?.contacts.map(c => c.full_name)).toEqual(EDF_BEST_FIRST)
  })
})

describe('groupContacts — catégories de persona (#3593)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  const withRole = (name: string, role: Contact['decision_role'], priority: number): Contact =>
    ({ id: name, account_id: 'a1', full_name: name, title: `Poste ${name}`, decision_role: role, priority }) as Contact

  it('regroupe par CATÉGORIE de persona (rôle de décision), pas par intitulé de poste', () => {
    const groups = groupContacts(
      [withRole('A', 'technical', 1), withRole('B', 'technical', 2), withRole('C', 'economic', 3)],
      'persona',
    )
    expect(groups.map(g => g.entity)).toEqual(['Décideur économique', 'Référent technique'])
    expect(groups[1]?.contacts.map(c => c.full_name)).toEqual(['A', 'B'])
  })

  it('range les catégories dans l’ordre de décision, « à qualifier » en dernier', () => {
    const groups = groupContacts(
      [
        withRole('U', null, 1),
        withRole('I', 'influencer', 2),
        withRole('E', 'economic', 3),
        withRole('X', 'unknown', 4),
      ],
      'persona',
    )
    expect(groups.map(g => g.entity)).toEqual(['Décideur économique', 'Influenceur', 'Persona à qualifier'])
    expect(groups[2]?.contacts.map(c => c.full_name)).toEqual(['U', 'X'])
  })
})

describe('groupContacts — Recette 21/10 A.1 : « Persona à qualifier » replié par défaut', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })
  const withRole = (name: string, role: Contact['decision_role']): Contact =>
    ({ id: name, account_id: 'a1', full_name: name, decision_role: role, priority: 1 }) as Contact

  it('ne replie QUE le groupe à qualifier, et garde tous les contacts', () => {
    const groups = groupContacts([withRole('E', 'economic'), withRole('U', null), withRole('X', 'unknown')], 'persona')
    expect(groups.map(g => [g.entity, g.collapsedByDefault ?? false])).toEqual([
      ['Décideur économique', false],
      ['Persona à qualifier', true],
    ])
    expect(groups[1]?.contacts).toHaveLength(2)
  })

  it('ne replie rien en mode entité', () => {
    expect(groupContacts([withRole('U', null)], 'entity').every(g => !g.collapsedByDefault)).toBe(true)
  })
})

describe('getContactPersona', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('prefers the scope, which is free text and stays untouched', () => {
    expect(getContactPersona(contactWith({ scope: 'France & Benelux', seniority: 'c_suite' }))).toBe('France & Benelux')
  })

  it('translates the Apollo seniority it falls back on', () => {
    expect(getContactPersona(contactWith({ seniority: 'c_suite' }))).toBe('Direction générale')
  })

  it('keeps an unknown seniority exactly as stored', () => {
    expect(getContactPersona(contactWith({ seniority: 'Comité exécutif groupe' }))).toBe('Comité exécutif groupe')
  })

  it('translates in EN too (i18n parity)', async () => {
    await i18n.changeLanguage('en')
    expect(getContactPersona(contactWith({ seniority: 'director' }))).toBe('Director')
    await i18n.changeLanguage('fr')
  })
})

/* ------------------------------------------------------------------ */
/*  filterContacts — Entité / Niveau, les deux filtres manquants        */
/*  (maquette 03_tous_contacts_couverture.png)                          */
/* ------------------------------------------------------------------ */

const alice = contactWith({
  id: 'c1',
  full_name: 'Alice Dupont',
  title: 'DSI',
  entity: 'BU IT',
  decision_role: 'champion',
})
const bob = contactWith({
  id: 'c2',
  full_name: 'Bob Martin',
  title: 'RSSI',
  entity: 'BU Sécurité',
  decision_role: 'blocker',
})
const noLevel = (): null => null

describe('filterContacts', () => {
  it('search matches name, title or entity — unchanged behaviour', () => {
    expect(filterContacts([alice, bob], 'rssi', { role: 'all', entity: 'all', level: 'all' }, noLevel)).toEqual([bob])
    expect(filterContacts([alice, bob], 'BU IT', { role: 'all', entity: 'all', level: 'all' }, noLevel)).toEqual([
      alice,
    ])
  })

  it('role filter — unchanged behaviour', () => {
    expect(filterContacts([alice, bob], '', { role: 'blocker', entity: 'all', level: 'all' }, noLevel)).toEqual([bob])
  })

  it('NEW — entity filter narrows the list', () => {
    expect(filterContacts([alice, bob], '', { role: 'all', entity: 'BU IT', level: 'all' }, noLevel)).toEqual([alice])
  })

  it('NEW — level filter reads the level from the injected lookup, not from Contact', () => {
    const levelOf = (c: Contact) => (c.id === 'c1' ? 'L2' : 'L4')
    expect(filterContacts([alice, bob], '', { role: 'all', entity: 'all', level: 'L2' }, levelOf)).toEqual([alice])
  })

  it('a contact with no known level never matches a specific level filter — it is simply excluded, not defaulted', () => {
    expect(filterContacts([alice], '', { role: 'all', entity: 'all', level: 'L1' }, noLevel)).toEqual([])
  })

  it('all three new/old filters combine (AND)', () => {
    const levelOf = () => 'L2' as const
    expect(filterContacts([alice, bob], '', { role: 'champion', entity: 'BU IT', level: 'L2' }, levelOf)).toEqual([
      alice,
    ])
    expect(filterContacts([alice, bob], '', { role: 'blocker', entity: 'BU IT', level: 'L2' }, levelOf)).toEqual([])
  })
})

/* ------------------------------------------------------------------ */
/*  buildContactLevelMap — la SEULE clé commune est le slug du nom      */
/*  (même convention que OrgInfluenceMap.contactBySlug)                 */
/* ------------------------------------------------------------------ */

function orgGraphWithLevels(): OrgGraph {
  return orgGraphSchema.parse({
    graphVersion: 3,
    entities: [],
    people: [
      {
        id: 'p-alice-dupont',
        fullName: 'Alice Dupont',
        hierarchyLevel: 'L2',
        decisionRoles: [],
        identityStatus: 'classified',
        confidence: 60,
        sources: [],
      },
      // Bob n'a PAS de hierarchyLevel dans le graphe : il ne doit pas
      // apparaître dans la map — jamais un niveau deviné.
      {
        id: 'p-bob-martin',
        fullName: 'Bob Martin',
        decisionRoles: [],
        identityStatus: 'seed',
        confidence: 30,
        sources: [],
      },
    ],
    hierarchyEdges: [],
    influenceEdges: [],
    buyingCommittee: [],
    uncoveredZones: [],
    recommendedPath: [],
    rejectedItems: [],
  })
}

describe('buildContactLevelMap', () => {
  it('empty map when there is no graph — never a guessed level', () => {
    expect(buildContactLevelMap([alice, bob], null).size).toBe(0)
  })

  it('matches a contact to its graph node by the SAME name-slug the org tab already uses', () => {
    const map = buildContactLevelMap([alice, bob], orgGraphWithLevels())
    expect(map.get('c1')).toBe('L2')
  })

  it('a contact whose graph node carries no hierarchyLevel gets NO entry — not a fabricated L0', () => {
    const map = buildContactLevelMap([alice, bob], orgGraphWithLevels())
    expect(map.has('c2')).toBe(false)
  })

  it('a contact absent from the graph gets no entry either', () => {
    const stranger = contactWith({ id: 'c3', full_name: 'Nobody Knows Me' })
    const map = buildContactLevelMap([stranger], orgGraphWithLevels())
    expect(map.has('c3')).toBe(false)
  })
})

// #4465.2 (recette 23/10, CAFPI) — une personne dont le poste dans l'entreprise a une date de fin n'est plus « dans
// l'entreprise » : rangée à part (dernier groupe, replié), jamais retirée.
describe('groupContacts — #4465.2 les personnes parties sont rangées à part', () => {
  const stay = (name: string) =>
    ({ id: name, account_id: 'a1', full_name: name, entity: 'CAFPI' }) as unknown as Contact
  const gone = (name: string) =>
    ({
      id: name,
      account_id: 'a1',
      full_name: name,
      entity: 'CAFPI',
      employment_left: { organization: '', at: '2024-03-31' },
    }) as unknown as Contact

  it('mode entité : les contacts partis forment le dernier groupe, replié, et quittent leur entité', () => {
    const groups = groupContacts([gone('Partie Un'), stay('Resté Un'), stay('Resté Deux')], 'entity')
    expect(groups.map(group => group.contacts.map(c => c.full_name))).toEqual([
      ['Resté Un', 'Resté Deux'],
      ['Partie Un'],
    ])
    expect(groups[1]?.collapsedByDefault).toBe(true)
    expect(groups[1]?.entity).toBe(i18n.t('accountOrg:grouping.leftCompany'))
  })

  it('NON : personne n’est parti ⇒ aucun groupe « parti », l’ordre existant ne bouge pas', () => {
    const groups = groupContacts([stay('Un'), stay('Deux')], 'entity')
    expect(groups).toHaveLength(1)
    expect(groups[0]?.collapsedByDefault).toBeUndefined()
  })

  it('tous partis ⇒ un seul groupe, rien n’est retiré', () => {
    const groups = groupContacts([gone('A'), gone('B')], 'persona')
    expect(groups).toHaveLength(1)
    expect(groups[0]?.contacts).toHaveLength(2)
  })

  it('un poste en cours chez un AUTRE employeur (lu du parcours, nom du compte donné) range la personne à part', () => {
    const parti = {
      id: 'p',
      account_id: 'a1',
      full_name: 'Partie Ailleurs',
      entity: 'CAFPI',
      apollo_enrichment: { employment_history: [{ organization_name: 'Orange', title: 'Directrice', current: true }] },
    } as unknown as Contact
    const groups = groupContacts([parti, stay('Resté')], 'entity', '', 'CAFPI')
    expect(groups.map(group => group.contacts.map(c => c.full_name))).toEqual([['Resté'], ['Partie Ailleurs']])
    // NON : sans le nom du compte, rien ne se déduit — personne n'est rangé à part.
    expect(groupContacts([parti, stay('Resté')], 'entity')).toHaveLength(1)
  })
})

describe('groupContacts — bloc « Connu » (#4678)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  const known = (full_name: string, source: string, priority: number | null = null): Contact =>
    ({ id: full_name, account_id: 'a1', full_name, entity: 'VICAT', source, priority }) as unknown as Contact
  const found = (full_name: string): Contact =>
    ({ id: full_name, account_id: 'a1', full_name, entity: 'VICAT', source: 'apollo' }) as unknown as Contact

  it.each(['entity', 'persona'] as const)('rend les contacts connus EN PREMIER, en mode %s', mode => {
    const groups = groupContacts([found('Inconnu A'), known('Didier Montandon', 'import'), found('Inconnu B')], mode)
    expect(groups[0]?.entity).toBe('Connu')
    expect(groups[0]?.contacts.map(c => c.full_name)).toEqual(['Didier Montandon'])
    expect(groups[0]?.collapsedByDefault).toBeUndefined()
  })

  it("ne répète pas un contact connu dans un autre groupe (rien n'apparaît deux fois)", () => {
    const groups = groupContacts([found('Inconnu A'), known('Didier Montandon', 'import')], 'persona')
    const names = groups.flatMap(g => g.contacts.map(c => c.full_name))
    expect(names.filter(n => n === 'Didier Montandon')).toHaveLength(1)
  })

  it('en accepte plusieurs, triés par priorité, import comme crm', () => {
    const groups = groupContacts([known('B', 'crm', 3), known('A', 'import', 1), found('X')], 'entity')
    expect(groups[0]?.contacts.map(c => c.full_name)).toEqual(['A', 'B'])
  })

  it('AUCUN contact connu ⇒ aucun groupe « Connu » (pas de bloc vide, pas de 0)', () => {
    const groups = groupContacts([found('Inconnu A'), contactWith({ source: 'manual' })], 'entity')
    expect(groups.map(g => g.entity)).not.toContain('Connu')
  })

  it("un contact connu parti de l'entreprise reste rangé avec ceux qui sont partis", () => {
    const left = {
      ...known('Ancien', 'import'),
      employment_left: { organization: 'Autre SA', at: '2020-01-01' },
    } as unknown as Contact
    const groups = groupContacts([left, found('Inconnu A')], 'entity', '', 'VICAT')
    expect(groups.some(g => g.entity === 'Connu')).toBe(false)
  })
})

describe('groupContacts — une même personne probable ne figure qu’une fois en mode persona', () => {
  const pair = (left: Contact, right: Contact) => [{ left: { id: left.id }, right: { id: right.id } }]
  const boss = contactWith({
    id: 'p1',
    full_name: 'Claire Fontaine',
    decision_role: 'economic',
    email: 'c.fontaine@exemple.test',
    phone: '0102030405',
  })
  const sameInitial = contactWith({ id: 'p2', full_name: 'Claire F.', decision_role: 'champion' })

  it('la fiche la plus complète est gardée, sous sa persona : pas de seconde apparition sous « Champion »', () => {
    const groups = groupContacts([boss, sameInitial], 'persona', '', null, pair(boss, sameInitial))
    expect(groups.flatMap(g => g.contacts.map(c => c.id))).toEqual(['p1'])
  })

  it('à complétude égale, la persona la plus haute gagne', () => {
    const a = contactWith({ id: 'q1', full_name: 'Marc Durand', decision_role: 'champion' })
    const b = contactWith({ id: 'q2', full_name: 'Marc DURAND', decision_role: 'economic' })
    const groups = groupContacts([a, b], 'persona', '', null, pair(a, b))
    expect(groups.flatMap(g => g.contacts.map(c => c.id))).toEqual(['q2'])
  })

  it('sans paire proposée (ou en mode entité) rien ne disparaît', () => {
    expect(groupContacts([boss, sameInitial], 'persona', '', null, []).flatMap(g => g.contacts)).toHaveLength(2)
    expect(
      groupContacts([boss, sameInitial], 'entity', '', null, pair(boss, sameInitial)).flatMap(g => g.contacts),
    ).toHaveLength(2)
  })

  it('même adresse e-mail (shared_email_groups) : une seule apparition, la fiche nommée sous sa persona gagne à égalité', () => {
    const base = contactWith({ id: 'b1', full_name: 'Jules Marchand', email: 'j.marchand@exemple.test' })
    const named = contactWith({
      id: 'b2',
      full_name: 'Jules M.',
      decision_role: 'economic',
      email: 'j.marchand@exemple.test',
    })
    const links = probableDuplicateLinks({
      pairs: [],
      shared_email_groups: [{ email: 'j.marchand@exemple.test', contacts: [{ id: 'b1' }, { id: 'b2' }] }],
    })
    const ids = groupContacts([base, named], 'persona', '', null, links).flatMap(g => g.contacts.map(c => c.id))
    expect(ids).toHaveLength(1)
    // Le mode entité garde les deux fiches : rien n'est fusionné ni supprimé.
    expect(groupContacts([base, named], 'entity', '', null, links).flatMap(g => g.contacts)).toHaveLength(2)
  })

  it('trois fiches sur la même adresse ⇒ une seule apparition', () => {
    const three = ['t1', 't2', 't3'].map(id => contactWith({ id, full_name: `Fiche ${id}`, email: 'x@exemple.test' }))
    const links = probableDuplicateLinks({
      pairs: [],
      shared_email_groups: [{ email: 'x@exemple.test', contacts: three.map(c => ({ id: c.id })) }],
    })
    expect(groupContacts(three, 'persona', '', null, links).flatMap(g => g.contacts)).toHaveLength(1)
  })
})
