import { matchDeclaredToBellum, enrichDeclaredFromBellum } from './org-import-match'

const contact = (over: Record<string, unknown>) => ({
  id: 'c-1',
  full_name: 'Jean Dupont',
  title: 'DSI',
  email: 'jean.dupont@acme.fr',
  phone: '+33 1 02 03 04 05',
  linkedin_url: 'https://linkedin.com/in/jdupont',
  ...over,
})

describe('matchDeclaredToBellum (#3740.1)', () => {
  it('rapproche sur le nom normalisé (accents, casse) et rend les coordonnées EN CLAIR', () => {
    const rows = matchDeclaredToBellum([{ fullName: 'jean  DUPONT' }], { contacts: [contact({})], graphNames: [] })
    expect(rows[0]).toMatchObject({
      match: 'known_contact',
      bellum: { title: 'DSI', email: 'jean.dupont@acme.fr', phone: '+33 1 02 03 04 05' },
    })
  })

  it('une personne déjà dans le graphe est « known_in_graph », même sans contact', () => {
    const rows = matchDeclaredToBellum([{ fullName: 'Éric Martin' }], { contacts: [], graphNames: ['Eric Martin'] })
    expect(rows[0]!.match).toBe('known_in_graph')
    expect(rows[0]!.bellum).toBeUndefined()
  })

  it("« Jean Dupond » n'est pas « Jean Dupont » : on neutralise la forme, jamais l'orthographe", () => {
    const rows = matchDeclaredToBellum([{ fullName: 'Jean Dupond' }], { contacts: [contact({})], graphNames: [] })
    expect(rows[0]!.match).toBe('new')
  })

  it('nomme ce que Bellum apporte au fichier, jamais ce qui est déjà écrit ni ce qui manque des deux côtés', () => {
    const rows = matchDeclaredToBellum([{ fullName: 'Jean Dupont', title: 'Directeur SI' }], {
      contacts: [contact({})],
      graphNames: [],
    })
    expect(rows[0]!.fills).toEqual(['linkedinUrl'])
    const none = matchDeclaredToBellum([{ fullName: 'Jean Dupont' }], {
      contacts: [contact({ title: null, linkedin_url: null })],
      graphNames: [],
    })
    expect(none[0]!.fills).toEqual([])
  })
})

describe('enrichDeclaredFromBellum (#3740.2)', () => {
  it('complète le titre et LinkedIn VIDES, jamais ce que le fichier a écrit', () => {
    const [out] = enrichDeclaredFromBellum([{ fullName: 'Jean Dupont', title: 'Directeur SI' }], {
      contacts: [contact({})],
    })
    expect(out).toMatchObject({ title: 'Directeur SI', linkedinUrl: 'https://linkedin.com/in/jdupont' })
  })

  it('laisse intacte une personne sans correspondance', () => {
    const input = { fullName: 'Inconnue Totale' }
    expect(enrichDeclaredFromBellum([input], { contacts: [contact({})] })[0]).toEqual(input)
  })
})
