import { describe, expect, it } from 'vitest'
import { getRecommendation } from './types'

/**
 * #2932 (constat recette 27/09/2026, salle démo) — la fiche compte
 * (`AccountVerdictSummary.tsx`, `ScoreSummaryCard.tsx`) affiche le NOM
 * MÉTIER du verdict (AGIR MAINTENANT / RÉSERVE / METTRE EN VEILLE / ÉCARTER
 * POUR CET OBJECTIF) depuis le correctif #2932, mais `getRecommendation`
 * (lu par `AccountTableRow.tsx`, `AccountsCardList.tsx` et
 * `CompareDialogTable.tsx`, GA-26) était resté sur l'ancien libellé legacy
 * GO/PRUDENT/NO-GO — le MÊME compte se lisait différemment selon l'écran.
 *
 * La FAMILLE (GO/PRUDENT/NO-GO, `accountVerdictFromScore`) continue de
 * piloter la couleur (#2627.1) : ces tests portent sur le TEXTE seul.
 */
describe('getRecommendation — le nom métier de la fiche compte (#2932)', () => {
  it('8/10 (bande GO) affiche AGIR MAINTENANT, jamais l’ancien libellé GO', () => {
    expect(getRecommendation(8).label).toBe('AGIR MAINTENANT')
  })

  it('6/10 (bande PRUDENT) affiche RÉSERVE, jamais l’ancien libellé PRUDENT', () => {
    expect(getRecommendation(6).label).toBe('RÉSERVE')
  })

  it('3/10 (bande NO-GO) affiche ÉCARTER POUR CET OBJECTIF, jamais l’ancien libellé NO-GO', () => {
    expect(getRecommendation(3).label).toBe('ÉCARTER POUR CET OBJECTIF')
  })

  it('⚠️ SAIT DIRE NON — un compte jamais noté ne porte aucun mot de verdict inventé', () => {
    expect(getRecommendation(null).label).toBe('—')
  })
})
