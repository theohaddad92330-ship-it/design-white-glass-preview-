import { DEMO_CV_PREVIEW_COVERAGE } from './demo-coverage'
import { DEMO_CV_IMPORT_CONSULTANTS } from './demo-dataset'

/**
 * #4034 — « et en démonstration, l'aperçu du CV montre quoi ? » Craft rule
 * n°9 : le TEXTE extrait de chaque CV semé (mis en page par l'aperçu) ; aucun
 * faux fichier original — l'aperçu dit « Original non conservé ».
 */
describe('#4034 — aperçu du CV, en démonstration', () => {
  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_CV_PREVIEW_COVERAGE.state).toBe('seede')
    expect(DEMO_CV_PREVIEW_COVERAGE.reason).toContain('#4034')
    expect(DEMO_CV_PREVIEW_COVERAGE.reason).toContain('Original non conservé')
  })

  it('chaque CV semé porte un texte à mettre en page', () => {
    const documents = DEMO_CV_IMPORT_CONSULTANTS.flatMap(persona => persona.documents)
    expect(documents.length).toBeGreaterThan(0)
    for (const document of documents) expect(document.text.trim().length).toBeGreaterThan(0)
  })

  it('aucun document semé ne prétend porter un original (aucun faux fichier)', () => {
    const documents = DEMO_CV_IMPORT_CONSULTANTS.flatMap(persona => persona.documents)
    for (const document of documents) expect(document).not.toHaveProperty('storagePath')
  })
})
