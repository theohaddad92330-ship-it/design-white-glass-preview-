import { DEMO_RAG_DOCUMENTS } from './demo-dataset'
import { DEMO_ORG_DOCUMENT, demoOrgDocumentContent, demoOrgDocumentPeople } from './demo-org-document'

/**
 * #4072.7 (R46) — « Lire les organigrammes de tes documents » ne se découvre pas cassé en réunion : l'espace de
 * démonstration SÈME l'organigramme (rag_documents, portée compte) et l'API répond depuis le même contenu.
 */
describe('démo — organigramme déposé dans les documents (#4072.7)', () => {
  const seeded = DEMO_RAG_DOCUMENTS.find(document => document.title === DEMO_ORG_DOCUMENT.title)

  it("le document est SEMÉ, rattaché au compte vitrine, et son titre se dit organigramme (c'est ce que l'extraction filtre)", () => {
    expect(seeded).toBeDefined()
    expect(seeded?.scope).toBe('account')
    expect(seeded?.company).toBe('Société Générale')
    expect(seeded?.title).toMatch(/organigramme/i)
  })

  it('NON : la proposition rendue en démo ne dit QUE ce que le document semé ÉCRIT — mêmes noms, même N+1, même date', () => {
    const text = seeded?.content ?? ''
    expect(text).toBe(demoOrgDocumentContent())
    expect(text).toContain('12/03/2026')
    const proposal = demoOrgDocumentPeople('Société Générale')
    expect(proposal.documentsRead).toBe(1)
    for (const person of proposal.people) {
      expect(text).toContain(person.fullName)
      expect(person.documentDate).toBe('2026-03-12')
      if (person.managerName)
        expect(text).toContain(`${person.fullName}\t${person.title}\t${person.entityName}\t${person.managerName}`)
    }
    // Un N+1 n'existe que s'il est écrit : une seule ligne en porte un.
    expect(proposal.people.filter(person => person.managerName)).toHaveLength(1)
  })

  it('une partie des personnes est DÉJÀ au dossier (les deux premières du CRM fictif), le reste est à ajouter', () => {
    const names = demoOrgDocumentPeople('société générale').people.map(person => person.fullName)
    expect(names.slice(0, 2)).toEqual(['Lorenzo Bini Smaghi', 'Pierre Palmieri'])
    expect(names.length).toBeGreaterThan(2)
  })

  it('un autre compte : « aucun organigramme (0 lu) », jamais une personne inventée', () => {
    expect(demoOrgDocumentPeople('Groupe BPCE')).toEqual({ people: [], documentsRead: 0, truncated: false })
    expect(demoOrgDocumentPeople(null)).toEqual({ people: [], documentsRead: 0, truncated: false })
  })
})
