import { readListScore25 } from './account-list-score'

// #4016.91 (18/10) — la liste prend l'échelle de la fiche : le /25 de l'évaluation, lu aux mêmes trois places.
describe('readListScore25', () => {
  it('lit le /25 à la racine, puis sous le plan, puis dans evaluation_compte (même ordre que la fiche)', () => {
    expect(readListScore25({ root: '16', plan: '12', compte: '9' })).toBe(16)
    expect(readListScore25({ root: null, plan: '12', compte: '9' })).toBe(12)
    expect(readListScore25({ root: null, plan: null, compte: '9' })).toBe(9)
  })

  it('borne à 0–25 et arrondit, comme la fiche', () => {
    expect(readListScore25({ root: '31', plan: null, compte: null })).toBe(25)
    expect(readListScore25({ root: '15.6', plan: null, compte: null })).toBe(16)
    expect(readListScore25({ root: '-3', plan: null, compte: null })).toBe(0)
  })

  it('sait dire NON : un dossier sans /25 lisible rend null, jamais 0', () => {
    expect(readListScore25({ root: null, plan: null, compte: null })).toBeNull()
    expect(readListScore25({ root: 'abc', plan: '', compte: undefined })).toBeNull()
  })
})
