import { consultantsKnowingSector } from './consultant-sector-knowledge'

// #5017.2 — les consultants de l'espace qui ont DÉJÀ travaillé dans le secteur d'un compte.
describe('consultantsKnowingSector', () => {
  const rows = [
    { id: 'c1', full_name: 'Nadia Berger', sectors: ['Banque', 'Assurance'], archived_at: null },
    { id: 'c2', full_name: 'Paul Roux', sectors: ['Énergie'], archived_at: null },
    { id: 'c3', full_name: 'Sans Secteur', sectors: [], archived_at: null },
    { id: 'c4', full_name: 'Archivé', sectors: ['Banque'], archived_at: new Date() },
    { id: 'c5', full_name: null, sectors: ['Banque et finance'], archived_at: null },
  ]

  it('rend les consultants dont un secteur sourcé recoupe celui du compte, avec la preuve', () => {
    const out = consultantsKnowingSector(rows, 'banque')
    expect(out.map(c => c.id)).toEqual(['c1', 'c5'])
    expect(out[0]?.matched_sectors).toEqual(['Banque'])
    expect(out[1]?.full_name).toBeNull()
  })

  it('ne fait aucune ligne pour un consultant sans secteur ni pour un archivé', () => {
    const ids = consultantsKnowingSector(rows, 'Banque').map(c => c.id)
    expect(ids).not.toContain('c3')
    expect(ids).not.toContain('c4')
  })

  it('secteur du compte inconnu ou vide ⇒ aucune ligne, jamais tout le vivier', () => {
    expect(consultantsKnowingSector(rows, '')).toEqual([])
    expect(consultantsKnowingSector(rows, '   ')).toEqual([])
  })

  it('ne confond pas les accents ni la casse', () => {
    expect(consultantsKnowingSector(rows, 'ENERGIE').map(c => c.id)).toEqual(['c2'])
  })
})
