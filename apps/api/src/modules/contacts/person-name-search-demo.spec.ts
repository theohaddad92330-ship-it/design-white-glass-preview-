import { searchPeopleByNameResultSchema, supplierNamesIn } from '@bellum/contracts'
import { DEMO_PERSON_NAME_SEARCH_COVERAGE } from '../demo/demo-coverage'
import { DEMO_DOSSIERS } from '../demo/demo-dataset'
import { companiesCorrespond, searchDemoContactsByName, type DemoNameSearchRow } from './person-name-search-demo'

// #4386 — en démonstration, la recherche par nom cherche les personnes DU JEU
// DE DÉMO (craft rule n°9) : jamais un homonyme inventé à partir du nom tapé.
const ROWS: DemoNameSearchRow[] = [
  {
    id: 'c-1',
    full_name: 'Élise Varennes',
    title: 'DSI',
    linkedin_url: null,
    location: 'Paris',
    company: 'SNCF Voyageurs',
  },
  { id: 'c-2', full_name: 'Élise Varennes', title: 'Juriste', linkedin_url: null, location: null, company: 'Nordia' },
  { id: 'c-3', full_name: 'Jean-Marc Dupont', title: 'CTO', linkedin_url: null, location: null, company: 'Sanofi' },
  { id: 'c-4', full_name: '', title: 'DAF', linkedin_url: null, location: null, company: 'Sanofi' },
]

describe('searchDemoContactsByName (#4386)', () => {
  it('trouve une personne du jeu démo, accents/casse/ordre ignorés, entreprise correspondante d’abord', () => {
    const out = searchDemoContactsByName(ROWS, 'varennes elise', 'SNCF')
    expect(searchPeopleByNameResultSchema.parse(out)).toEqual(out)
    expect(out.status).toBe('ok')
    expect(out.hits.map(h => [h.id, h.match])).toEqual([
      ['demo:c-1', 'name_and_company'],
      ['demo:c-2', 'name_only'],
    ])
    expect(out.hits[0]).toMatchObject({ firstName: 'Élise', lastName: 'Varennes', sources: ['contact_base'] })
    expect(out.sourcesQueried).toEqual([{ family: 'contact_base', outcome: 'found', count: 2 }])
  })

  it('nom composé : « Jean Marc Dupont » retrouve « Jean-Marc Dupont »', () => {
    expect(searchDemoContactsByName(ROWS, 'Jean Marc Dupont').hits.map(h => h.id)).toEqual(['demo:c-3'])
  })

  it('personne hors jeu démo : vide HONNÊTE, la famille interrogée nommée — jamais un homonyme fabriqué', () => {
    const out = searchDemoContactsByName(ROWS, 'Theo Haddad', 'Bellum')
    expect(out).toEqual({
      hits: [],
      status: 'empty',
      sourcesQueried: [{ family: 'contact_base', outcome: 'empty', count: 0 }],
    })
  })

  it('nom vide : aucun résultat, aucune ligne sans identité', () => {
    expect(searchDemoContactsByName(ROWS, '   ').hits).toEqual([])
  })

  it('aucune famille ne porte un nom de fournisseur', () => {
    const out = searchDemoContactsByName(ROWS, 'Élise Varennes')
    expect(supplierNamesIn(JSON.stringify(out.sourcesQueried))).toEqual([])
  })

  it('le jeu démo SEEDÉ contient des personnes que la recherche retrouve', () => {
    const rows: DemoNameSearchRow[] = DEMO_DOSSIERS.flatMap(dossier =>
      dossier.contacts
        .filter(c => c.full_name)
        .map((c, i) => ({
          id: `${dossier.account.company_name}-${i}`,
          full_name: c.full_name,
          title: c.title,
          linkedin_url: null,
          location: null,
          company: dossier.account.company_name,
        })),
    )
    const someone = rows[0]!
    const out = searchDemoContactsByName(rows, someone.full_name.toUpperCase(), someone.company ?? undefined)
    expect(out.hits[0]?.match).toBe('name_and_company')
    expect(DEMO_PERSON_NAME_SEARCH_COVERAGE.state).toBe('seede')
  })
})

describe('companiesCorrespond (#4386, miroir de person_name_search.py)', () => {
  it.each([
    ['Bellum', 'BELLUM AI'],
    ['BellumAI', 'Bellum AI SAS'],
    ['bellum.com', 'Bellum Group'],
    ['SNCF', 'SNCF Voyageurs'],
  ])('« %s » ↔ « %s »', (a, b) => expect(companiesCorrespond(a, b)).toBe(true))

  it.each([
    ['Bellum', 'Bel Air'],
    ['AI', 'AI Partners'],
  ])('« %s » ≠ « %s »', (a, b) => expect(companiesCorrespond(a, b)).toBe(false))
})
