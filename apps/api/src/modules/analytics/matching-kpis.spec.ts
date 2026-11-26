import { computeMatchingKpis, MATCHING_KPI_KEYS, type MatchingKpiInput } from './matching-kpis'

const EMPTY: MatchingKpiInput = {
  submissions: 0,
  submissionsWon: 0,
  needToShortlistDays: [],
  shortlistToSubmissionDays: [],
  profilesPerNeed: [],
  rejectedProfiles: 0,
  rejectedProfilesRepositioned: 0,
}

const by = (key: string, kpis: ReturnType<typeof computeMatchingKpis>) => kpis.find(kpi => kpi.key === key)!

describe('les cinq KPI de matching', () => {
  it('restent NULL sous leur seuil, et disent combien il manque', () => {
    // C'est ce qui les rend livrables avant d'avoir l'historique : l'écran dit
    // « non mesurable — 3 sur 10 » au lieu de rester muet.
    const kpis = computeMatchingKpis({ ...EMPTY, submissions: 3, submissionsWon: 3 })
    const win = by('submission_win_rate', kpis)
    expect(win.value).toBeNull()
    expect(win.measurability).toMatchObject({ measurable: false, observed: 3, required: 10, missing: 7 })
  })

  it('un taux sur deux positionnements vaut 0 % ou 100 % — les deux sont faux', () => {
    const kpis = computeMatchingKpis({ ...EMPTY, submissions: 2, submissionsWon: 2 })
    expect(by('submission_win_rate', kpis).value).toBeNull()
  })

  it('s’allument tout seuls dès que l’historique suffit', () => {
    const kpis = computeMatchingKpis({ ...EMPTY, submissions: 10, submissionsWon: 3 })
    expect(by('submission_win_rate', kpis).value).toBeCloseTo(0.3)
  })

  it('rendent une MÉDIANE : un besoin repris trois mois plus tard ne fait pas la loi', () => {
    const kpis = computeMatchingKpis({ ...EMPTY, needToShortlistDays: [1, 2, 3, 4, 90] })
    expect(by('time_to_shortlist_days', kpis).value).toBe(3)
  })

  it('rendent TOUS les indicateurs, même sans donnée', () => {
    // Un indicateur qui disparaît quand il n'a rien à dire fait croire qu'il
    // n'existe pas, et personne ne se demande pourquoi il manque.
    expect(
      computeMatchingKpis(EMPTY)
        .map(kpi => kpi.key)
        .sort(),
    ).toEqual([...MATCHING_KPI_KEYS].sort())
  })

  it('n’exposent AUCUNE probabilité', () => {
    // Cinquième refus. Un taux observé dit ce qui s'est passé ; le présenter
    // comme une chance de réussir le prochain positionnement serait le score
    // que l'arbitrage n°4 interdit.
    expect(MATCHING_KPI_KEYS.some(key => /probab|chance|likelihood|closing/i.test(key))).toBe(false)
  })
})
