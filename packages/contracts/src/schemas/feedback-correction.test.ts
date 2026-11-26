import { describe, expect, it } from 'vitest'
import { applyFeedbackCorrections, correctionsChangeAnalysis } from './feedback-correction.js'

const ANALYSE = {
  contacts: [{ full_name: 'Ludovic V.' }, { full_name: 'Yiming L.' }],
  recentSignals: [{ signal: 'Budget confirmé' }, { signal: 'Plan 2021' }],
  companyName: 'Société Générale',
}

describe('une correction change l’analyse, sans rejouer le dossier (§58, P1-10)', () => {
  it('un contact signalé FAUX sort de l’analyse', () => {
    // Signaler une erreur et voir la note ne pas bouger apprend une chose à
    // l'utilisateur : que son retour ne sert à rien.
    const out = applyFeedbackCorrections(ANALYSE, [{ target: 'contact', targetRef: 'Yiming L.', verdict: 'faux' }])
    expect((out.contacts as unknown[]).map(c => (c as { full_name: string }).full_name)).toEqual(['Ludovic V.'])
  })

  it('un signal marqué OBSOLÈTE sort aussi', () => {
    const out = applyFeedbackCorrections(ANALYSE, [{ target: 'signal', targetRef: 'Plan 2021', verdict: 'obsolete' }])
    expect(out.recentSignals).toHaveLength(1)
  })

  it('« inutile » ne retire RIEN', () => {
    // « Inutile » dit que l'élément n'aide pas, pas qu'il est faux. Le retirer
    // effacerait un fait exact au motif qu'il n'intéresse pas — le dossier
    // deviendrait moins vrai, pas plus utile.
    const out = applyFeedbackCorrections(ANALYSE, [{ target: 'contact', targetRef: 'Yiming L.', verdict: 'inutile' }])
    expect(out.contacts).toHaveLength(2)
  })

  it('« utile » non plus — c’est un encouragement, pas une correction', () => {
    expect(correctionsChangeAnalysis([{ target: 'contact', targetRef: 'x', verdict: 'utile' }])).toBe(false)
    expect(correctionsChangeAnalysis([{ target: 'contact', targetRef: 'x', verdict: 'faux' }])).toBe(true)
  })

  it('l’analyse d’origine n’est pas modifiée', () => {
    // Une correction est une LECTURE différente des mêmes faits, pas leur
    // effacement : un utilisateur qui se trompe doit pouvoir revenir en arrière.
    const copie = JSON.parse(JSON.stringify(ANALYSE))
    applyFeedbackCorrections(ANALYSE, [{ target: 'contact', targetRef: 'Yiming L.', verdict: 'faux' }])
    expect(ANALYSE).toEqual(copie)
  })

  it('une référence vide ou inconnue ne retire rien par accident', () => {
    // Le pire défaut ici serait un `matches` trop permissif : une référence
    // vide qui vide la liste entière.
    const vide = applyFeedbackCorrections(ANALYSE, [{ target: 'contact', targetRef: '  ', verdict: 'faux' }])
    expect(vide.contacts).toHaveLength(2)
    const inconnu = applyFeedbackCorrections(ANALYSE, [{ target: 'contact', targetRef: 'Personne', verdict: 'faux' }])
    expect(inconnu.contacts).toHaveLength(2)
  })

  it('les champs non visés sont intacts', () => {
    const out = applyFeedbackCorrections(ANALYSE, [{ target: 'contact', targetRef: 'Yiming L.', verdict: 'faux' }])
    expect(out.companyName).toBe('Société Générale')
    expect(out.recentSignals).toHaveLength(2)
  })

  it('une analyse absente ne fait pas lever', () => {
    expect(applyFeedbackCorrections(null, [{ target: 'contact', targetRef: 'x', verdict: 'faux' }])).toEqual({})
  })
})
