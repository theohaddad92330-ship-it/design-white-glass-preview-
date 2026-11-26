import { DEMO_RAG_DOCUMENTS } from './demo-dataset'

/**
 * #3623 — craft rule n°9 : /search joint désormais des documents à une analyse (CSV, ZIP, classeurs…),
 * mais le dépôt est refusé dans la salle de démonstration. Un document semé au COMPTE montre ce que
 * « joindre une base documentaire » donne : la liste d'un compte démo en porte un, lisible par l'analyse.
 */
describe('Démo — documents joints à une analyse (#3623)', () => {
  it('sème un CSV rattaché à un compte', () => {
    const csv = DEMO_RAG_DOCUMENTS.find(doc => doc.title.includes('csv, démo'))
    expect(csv?.scope).toBe('account')
    expect(csv?.company).toBeTruthy()
  })

  it('le CSV semé garde ses colonnes séparées par des virgules, comme le texte lu', () => {
    const csv = DEMO_RAG_DOCUMENTS.find(doc => doc.title.includes('csv, démo'))
    const lines = (csv?.content ?? '').split('\n')
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every(line => line.split(',').length === 3)).toBe(true)
  })
})
