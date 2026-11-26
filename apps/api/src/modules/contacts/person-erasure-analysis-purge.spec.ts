import { normalizeFullName } from './contact-identity'
import {
  erasedPersonGraphNodeIds,
  purgePersonFromAnalysis,
  type ErasedPersonIdentity,
} from './person-erasure-analysis-purge'

const claire: ErasedPersonIdentity = {
  fullNames: ['Claire Perrin', 'PERRIN Claire'],
  emails: ['Claire.Perrin@acme.fr'],
  linkedinUrls: ['https://www.linkedin.com/in/claire-perrin/'],
  apolloIds: ['AP-42'],
  contactIds: ['c-1'],
}

/** Un dossier tel que les écrivains de `raw_analysis` le stockent : registre
 *  (dirigeants, bénéficiaires), contacts classés, organigramme hérité du modèle
 *  (`organigramme`, `decisionChain`, `stakeholderMap`, `approach_order`),
 *  graphe typé (`orgGraph`), plan et actualités. */
function dossier() {
  return {
    company_name: 'Acme',
    summary: 'Acme modernise son SI ; Claire Perrin (DSI) pilote le programme, avec Jean Dupont.',
    executives: [
      { first_name: 'Claire', last_name: 'PERRIN', role: 'Directrice générale déléguée', is_c_level: true },
      { first_name: 'Jean', last_name: 'Dupont', role: 'Président', is_c_level: true },
    ],
    beneficial_owners: [{ name: 'PERRIN Claire', percentage: 12 }],
    contacts: [
      { fullName: 'Claire Perrin', email: 'claire.perrin@acme.fr', title: 'DSI' },
      { fullName: 'Jean Dupont', title: 'RSSI' },
    ],
    org: {
      organigramme: [
        { entity: 'DSI', level: 'L2', contacts: ['Claire Perrin', 'Jean Dupont — RSSI'], missingRoles: ['Achats'] },
      ],
      decisionChain: {
        description: 'Décision portée par Claire Perrin, validée par le COMEX.',
        steps: [{ step: 'Cadrage', actors: ['Claire Perrin (DSI)', 'Jean Dupont (RSSI)'] }],
        budgetAuthority: 'Claire Perrin',
      },
      stakeholderMap: [
        { fullName: 'Claire Perrin', stance: 'supporter', reasoning: 'Porte le programme.' },
        { fullName: 'Jean Dupont', stance: 'neutral', reasoning: 'Prudent.' },
      ],
      approach_order: ['1. Claire Perrin — sponsor', '2. Jean Dupont — prescripteur'],
      orgGraph: {
        graphVersion: 3,
        people: [
          {
            id: 'p-7',
            fullName: 'Claire Perrin',
            sources: [{ kind: 'web', url: 'https://fr.linkedin.com/in/claire-perrin' }],
          },
          { id: 'p-8', fullName: 'Jean Dupont', sources: [] },
          { id: 'p-9', fullName: 'Marc Dubois', sources: [] },
        ],
        hierarchyEdges: [
          { fromId: 'p-7', toId: 'p-8', type: 'manages' },
          { fromId: 'p-8', toId: 'p-9', type: 'manages' },
        ],
        influenceEdges: [{ fromId: 'p-9', toId: 'p-7', stance: 'supporter' }],
        buyingCommittee: [
          { personId: 'p-7', role: 'sponsor' },
          { personId: 'p-8', role: 'user' },
        ],
        recommendedPath: [
          { personId: 'p-7', action: 'Rencontrer' },
          { personId: 'p-8', action: 'Qualifier' },
        ],
        pathOrigin: { personId: 'p-7', form: 'warm' },
      },
    },
    user_plan_actions: [
      { label: 'Écrire à claire.perrin@acme.fr', contact_id: 'c-1' },
      { label: 'Relancer le RSSI', contact_id: 'c-9' },
    ],
    news: [{ title: 'Acme accélère', url: 'https://example.org/acme-accelere' }],
  }
}

/** Ce qu'un lecteur retrouverait d'elle dans le blob, toutes graphies confondues. */
function traces(value: unknown): string[] {
  const json = JSON.stringify(value)
  const text = ` ${normalizeFullName(json)} `
  const lower = json.toLowerCase()
  return [
    ...(text.includes(' claire perrin ') ? ['nom'] : []),
    ...(text.includes(' perrin claire ') ? ['nom inversé'] : []),
    ...(lower.includes('claire.perrin@acme.fr') ? ['adresse'] : []),
    ...(lower.includes('linkedin.com/in/claire-perrin') ? ['profil'] : []),
    ...(lower.includes('"p-7"') ? ['identifiant du graphe'] : []),
    ...(lower.includes('"c-1"') ? ['identifiant de fiche'] : []),
  ]
}

describe('purgePersonFromAnalysis — #2297.51 l’organigramme purgé tout de suite', () => {
  it('après effacement, elle n’apparaît plus NULLE PART dans le dossier', () => {
    const before = dossier()
    expect(traces(before)).toEqual([
      'nom',
      'nom inversé',
      'adresse',
      'profil',
      'identifiant du graphe',
      'identifiant de fiche',
    ])

    const { value, changed } = purgePersonFromAnalysis(before, claire)

    expect(changed).toBe(true)
    expect(traces(value)).toEqual([])
  })

  it('sait dire NON : les autres personnes, leurs liens et le reste du dossier restent', () => {
    const { value } = purgePersonFromAnalysis(dossier(), claire)
    const org = value.org

    expect(value.company_name).toBe('Acme')
    expect(value.summary).toBe('Acme modernise son SI ; […] (DSI) pilote le programme, avec Jean Dupont.')
    expect(value.executives).toEqual([{ first_name: 'Jean', last_name: 'Dupont', role: 'Président', is_c_level: true }])
    expect(value.beneficial_owners).toEqual([])
    expect(value.contacts).toEqual([{ fullName: 'Jean Dupont', title: 'RSSI' }])
    expect(org.organigramme).toEqual([
      { entity: 'DSI', level: 'L2', contacts: ['Jean Dupont — RSSI'], missingRoles: ['Achats'] },
    ])
    expect(org.decisionChain).toEqual({
      description: 'Décision portée par […], validée par le COMEX.',
      steps: [{ step: 'Cadrage', actors: ['Jean Dupont (RSSI)'] }],
    })
    expect(org.stakeholderMap).toEqual([{ fullName: 'Jean Dupont', stance: 'neutral', reasoning: 'Prudent.' }])
    expect(org.approach_order).toEqual(['2. Jean Dupont — prescripteur'])
    expect(org.orgGraph).toEqual({
      graphVersion: 3,
      people: [
        { id: 'p-8', fullName: 'Jean Dupont', sources: [] },
        { id: 'p-9', fullName: 'Marc Dubois', sources: [] },
      ],
      hierarchyEdges: [{ fromId: 'p-8', toId: 'p-9', type: 'manages' }],
      influenceEdges: [],
      buyingCommittee: [{ personId: 'p-8', role: 'user' }],
      recommendedPath: [{ personId: 'p-8', action: 'Qualifier' }],
    })
    expect(value.user_plan_actions).toEqual([{ label: 'Relancer le RSSI', contact_id: 'c-9' }])
    expect(value.news).toEqual([{ title: 'Acme accélère', url: 'https://example.org/acme-accelere' }])
  })

  it('une propriété dont la CLÉ est son nom part aussi (un index par personne)', () => {
    const { value } = purgePersonFromAnalysis({ scores: { 'Claire Perrin': 80, 'Jean Dupont': 60 } }, claire)
    expect(value).toEqual({ scores: { 'Jean Dupont': 60 } })
  })

  it('sait dire NON : un nœud à identifiant court (« 1 ») n’emporte pas tous les « 1 » du dossier', () => {
    const { value } = purgePersonFromAnalysis(
      {
        people: [
          { id: '1', fullName: 'Claire Perrin' },
          { id: '2', fullName: 'Jean Dupont' },
        ],
        edges: [{ fromId: '1', toId: '2' }],
        memberIds: ['1', '2'],
        level: '1',
        ranks: ['1', '2'],
      },
      claire,
    )
    expect(value).toEqual({
      people: [{ id: '2', fullName: 'Jean Dupont' }],
      edges: [],
      memberIds: ['2'],
      level: '1',
      ranks: ['1', '2'],
    })
  })

  it('ne modifie pas le dossier reçu : il rend une copie', () => {
    const before = dossier()
    const snapshot = JSON.stringify(before)
    purgePersonFromAnalysis(before, claire)
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('sait dire NON : un dossier qui ne la nomme pas ressort identique, et « inchangé »', () => {
    const before = { org: { stakeholderMap: [{ fullName: 'Jean Dupont', stance: 'neutral' }] }, summary: 'Rien.' }
    const { value, changed } = purgePersonFromAnalysis(before, claire)
    expect(changed).toBe(false)
    expect(value).toEqual(before)
  })

  it('sait dire NON : un prénom SEUL ne désigne personne — « Claire » d’un autre n’est pas effacée', () => {
    const before = {
      stakeholderMap: [{ fullName: 'Claire Martin' }, { fullName: 'Claire' }],
      summary: 'Claire a confirmé le budget.',
    }
    const { value, changed } = purgePersonFromAnalysis(before, claire)
    expect(changed).toBe(false)
    expect(value).toEqual(before)
  })

  it('une personne effacée sous un nom d’un seul mot n’est reconnue que par ses clés fortes', () => {
    const lone: ErasedPersonIdentity = {
      fullNames: ['Claire'],
      emails: ['claire.perrin@acme.fr'],
      linkedinUrls: [],
      apolloIds: [],
      contactIds: [],
    }
    const { value } = purgePersonFromAnalysis(
      {
        contacts: [{ fullName: 'Claire', email: 'claire.perrin@acme.fr' }, { fullName: 'Claire' }],
        note: 'Voir Claire.',
      },
      lone,
    )
    expect(value).toEqual({ contacts: [{ fullName: 'Claire' }], note: 'Voir Claire.' })
  })
})

// #2297.51 — sert à purger `org_graph_corrections` : le ledger de corrections
// est un TABLE À PART, jamais parcourue par `purgePersonFromAnalysis`, et ses
// lignes la désignent par le MÊME identifiant que `orgGraph.people[].id`.
describe('erasedPersonGraphNodeIds — #2297.51 les identifiants de graphe qui la portent', () => {
  it('retrouve son nœud dans le graphe — jamais celui d’un autre', () => {
    const ids = erasedPersonGraphNodeIds([dossier()], claire)
    expect(ids.has('p-7')).toBe(true)
    expect(ids.has('p-8')).toBe(false)
    expect(ids.has('p-9')).toBe(false)
  })

  it('inclut aussi les identifiants de SES fiches (`contactIds`)', () => {
    const ids = erasedPersonGraphNodeIds([{}], claire)
    expect(ids.has('c-1')).toBe(true)
  })

  it('parcourt plusieurs dossiers (raw_analysis ET previous_raw_analysis) et les cumule', () => {
    const ids = erasedPersonGraphNodeIds(
      [dossier(), { org: { orgGraph: { people: [{ id: 'p-old', fullName: 'Claire Perrin' }] } } }],
      claire,
    )
    expect(ids.has('p-7')).toBe(true)
    expect(ids.has('p-old')).toBe(true)
  })

  it('sait dire NON : un dossier vide ne rend que les identifiants de fiche', () => {
    const ids = erasedPersonGraphNodeIds([null, undefined], claire)
    expect(ids).toEqual(new Set(claire.contactIds))
  })
})
