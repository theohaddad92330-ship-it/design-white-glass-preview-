import { DEMO_CHAT_ADD_CV_COVERAGE } from './demo-coverage'

/** #AM.58 — « Ajouter un CV » depuis le fil de Laura : classé, avec sa raison écrite (craft rule 9). */
describe('demo-coverage — Ajouter un CV depuis le fil (#AM.58)', () => {
  it('est classé « vide à dessein » avec sa raison, qui nomme le dépôt réutilisé', () => {
    expect(DEMO_CHAT_ADD_CV_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_CHAT_ADD_CV_COVERAGE.reason).toContain('CvDropZone')
    expect(DEMO_CHAT_ADD_CV_COVERAGE.reason.length).toBeGreaterThan(40)
  })
})
