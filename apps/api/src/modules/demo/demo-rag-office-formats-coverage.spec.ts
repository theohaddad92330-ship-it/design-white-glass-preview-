import { DEMO_RAG_DOCUMENTS } from './demo-dataset'

/**
 * #3751.7 — craft rule n°9 : Connaissances accepte désormais docx / xlsx / pptx,
 * mais le dépôt est refusé dans la salle de démonstration. Sans document semé de
 * chaque format, un prospect ne verrait jamais ce que l'écran sait lire.
 */
describe('Démo — formats bureautiques de la base de connaissance (#3751.7)', () => {
  it.each(['docx', 'xlsx', 'pptx'])('sème au moins un document %s', format => {
    expect(DEMO_RAG_DOCUMENTS.some(doc => doc.title.includes(`${format}, démo`))).toBe(true)
  })

  it('le classeur semé garde ses lignes et ses colonnes (tabulations), comme le texte extrait', () => {
    const sheet = DEMO_RAG_DOCUMENTS.find(doc => doc.title.includes('xlsx, démo'))
    const lines = (sheet?.content ?? '').split('\n')
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every(line => line.includes('\t'))).toBe(true)
  })
})
