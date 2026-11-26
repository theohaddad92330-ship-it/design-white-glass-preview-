import { DEMO_DOCUMENT_PROJECTS_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS, DEMO_RAG_DOCUMENTS, DEMO_SANOFI_PROJECT_NOTES_TITLE } from './demo-dataset'

/**
 * #3889 (épopée #3977) — « quels projets a Sanofi dans nos documents ? » est démontrable (craft rule n°9).
 * Ce fichier lit le VRAI jeu de données : le document semé, sa portée, son compte, et un passage par rangement
 * de `search_document_projects` (apps/ia, `document_projects.py`).
 */
describe('#3889 — les projets Sanofi décrits dans les documents de la salle', () => {
  const notes = DEMO_RAG_DOCUMENTS.find(doc => doc.title === DEMO_SANOFI_PROJECT_NOTES_TITLE)
  const lines = (notes?.content ?? '').split('\n')

  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_DOCUMENT_PROJECTS_COVERAGE.state).toBe('seede')
    expect(DEMO_DOCUMENT_PROJECTS_COVERAGE.reason).toContain('#3889')
  })

  it('LIT un vrai document — sinon tout ce qui suit serait vrai par vacuité', () => {
    expect(notes).toBeDefined()
  })

  it('est rattaché au compte Sanofi, que la salle sème vraiment', () => {
    expect(notes?.scope).toBe('account')
    expect(notes?.company).toBe('Sanofi')
    expect(DEMO_DOSSIERS.some(dossier => dossier.account.company_name === notes?.company)).toBe(true)
  })

  it('porte un passage par rangement, sur ce que le texte DIT', () => {
    expect(lines.some(line => line.startsWith('Besoin ouvert'))).toBe(true)
    expect(lines.some(line => line.startsWith('Besoin annulé'))).toBe(true)
    expect(lines.some(line => line.startsWith('Mission terminée'))).toBe(true)
    expect(lines.some(line => line.startsWith('Projet du client'))).toBe(true)
  })

  it('sait dire NON : le besoin « non daté » ne porte ni date ni mot de statut', () => {
    const undated = lines.find(line => line.startsWith('Besoin évoqué'))
    expect(undated).toBeDefined()
    expect(undated).not.toMatch(/\b(19|20)\d\d\b|\d{1,2}\/\d{1,2}\/\d{4}/)
    expect(undated).not.toMatch(/ouvert|en cours|annoncé|prévu|annulé|terminé|clos|fermé|pourvu|perdu|gagné/i)
  })

  it('le besoin annulé est celui que l’historique du compte porte déjà (#3895), jamais un second fait', () => {
    const sanofi = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Sanofi')
    const closedTitle = sanofi?.closedNeeds?.[0]?.title ?? ''
    expect(closedTitle).toContain('plateforme analytique R&D')
    expect(lines.find(line => line.startsWith('Besoin annulé'))).toContain('plateforme analytique R&D')
  })

  it('se dit FICTIF et n’écrit aucune date qui vieillirait', () => {
    expect(notes?.content).toContain('FICTIVES')
    expect(notes?.content).not.toMatch(/\b(19|20)\d\d\b/)
  })
})
