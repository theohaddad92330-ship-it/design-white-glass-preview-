import { describe, expect, it } from 'vitest'
import { describeSimilarHeadline, headlineNamesAnAccount } from './similarHeadline'

describe('describeSimilarHeadline — une seule raison, la plus forte', () => {
  it('« compte jumeau » passe devant tout, y compris devant un profil recoupé', () => {
    expect(describeSimilarHeadline({ kind: 'twin', referenceAccount: 'Thales' }, true)).toEqual({
      kind: 'twin',
      account: 'Thales',
    })
  })

  it('« environnement technologique » passe devant les critères du profil', () => {
    expect(
      describeSimilarHeadline({ kind: 'tech', referenceAccount: 'Thales', technologies: ['java', 'c++'] }, true),
    ).toEqual({ kind: 'tech', account: 'Thales', technologies: ['java', 'c++'] })
  })

  it('retombe sur les critères du profil quand la techno n’a NOMMÉ aucune technologie', () => {
    // Une raison `tech` sans liste ne dit rien de plus que « proche » : elle
    // n'est pas affichable, et l'écran ne doit pas écrire une phrase creuse.
    expect(describeSimilarHeadline({ kind: 'tech', referenceAccount: 'Thales', technologies: [] }, true)).toEqual({
      kind: 'criteria',
    })
  })

  it('garde le comportement d’AVANT ce lot quand le profil est recoupé', () => {
    expect(describeSimilarHeadline({ kind: 'sector', referenceAccount: 'Thales' }, true)).toEqual({ kind: 'criteria' })
  })

  it('nomme la PROVENANCE quand rien du profil n’a matché', () => {
    expect(describeSimilarHeadline({ kind: 'sector', referenceAccount: 'Thales' }, false)).toEqual({
      kind: 'sector',
      account: 'Thales',
    })
  })

  it('garde l’aveu pour une réponse d’API antérieure au champ', () => {
    expect(describeSimilarHeadline(undefined, false)).toEqual({ kind: 'seed' })
  })

  it('garde l’aveu plutôt qu’une phrase qui ne nomme personne', () => {
    expect(describeSimilarHeadline({ kind: 'sector', referenceAccount: '   ' } as never, false)).toEqual({
      kind: 'seed',
    })
  })

  it('les trois raisons qui nomment un compte remplacent la ligne des critères', () => {
    expect(headlineNamesAnAccount({ kind: 'twin', account: 'A' })).toBe(true)
    expect(headlineNamesAnAccount({ kind: 'tech', account: 'A', technologies: ['java'] })).toBe(true)
    expect(headlineNamesAnAccount({ kind: 'sector', account: 'A' })).toBe(true)
    expect(headlineNamesAnAccount({ kind: 'criteria' })).toBe(false)
    expect(headlineNamesAnAccount({ kind: 'seed' })).toBe(false)
  })
})
