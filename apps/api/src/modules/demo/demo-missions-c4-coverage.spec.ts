import { demandFromSnapshot } from '../consultants/matching/reverse-market'
import { DEMO_ACCOUNT_MISSIONS_COVERAGE, DEMO_MISSIONS_FOR_PROFILE_COVERAGE } from './demo-coverage'
import { DEMO_CONSULTANTS, DEMO_DELIVERY_CLIENT, DEMO_TERRITORY_SNAPSHOTS } from './demo-dataset'

/**
 * LOT C4 (07/10) — les deux nouveautés sont REMPLIES en démonstration (craft rule n°9).
 *
 * Aucune n'ajoute de table ni de clé de `raw_analysis` : la garde par table ne pose donc aucune
 * question. Celle-ci relit le JEU avec les MÊMES fonctions pures que le serveur, et tombe le jour où
 * le semis cesse de remplir l'écran.
 */
describe('#3816 — « missions pour ce profil » en démonstration', () => {
  const camille = DEMO_CONSULTANTS.find(consultant => consultant.full_name === 'Camille Roussel')
  const rhone = DEMO_TERRITORY_SNAPSHOTS.filter(snapshot => snapshot.department === '69').sort(
    (a, b) => a.weeksAgo - b.weeksAgo,
  )[0]

  it('la fiche de Camille Roussel recoupe RÉELLEMENT la demande du dernier relevé du Rhône', () => {
    expect(camille).toBeDefined()
    expect(rhone).toBeDefined()
    // Même croisement que `ReverseMarketService.forTalent` : un `sameTerm` normalisé, jamais un `includes`.
    const demand = demandFromSnapshot(
      {
        department: '69',
        takenOn: '2026-10-05',
        offers: rhone!.offers,
        topTechnologies: rhone!.topTechnologies,
        esnHiring: rhone!.esnHiring,
      },
      camille!.stack,
    )
    expect(demand.matchedTechnologies.length).toBeGreaterThan(0)
    // Sans recruteur relevé sur la zone, l'outil n'aurait aucun compte à lister.
    expect(rhone!.esnHiring.length).toBeGreaterThan(0)
  })

  it('la capacité est classée « seedée », avec sa raison', () => {
    expect(DEMO_MISSIONS_FOR_PROFILE_COVERAGE.state).toBe('seede')
    expect(DEMO_MISSIONS_FOR_PROFILE_COVERAGE.reason).toContain('Camille Roussel')
  })
})

describe('#3823 — « Missions pour ce compte » en démonstration', () => {
  const OPEN = (stage: string) => !['detected', 'potential', 'won', 'lost', 'abandoned'].includes(stage)

  it('le compte de la salle porte une affaire OUVERTE, sourcée, avec ses interlocuteurs', () => {
    const missions = DEMO_DELIVERY_CLIENT.signalsAndNeedsCases.filter(cas => OPEN(cas.stage) && cas.source)
    expect(missions.length).toBeGreaterThan(0)
    expect(missions.some(cas => (cas.contacts ?? []).length > 0)).toBe(true)
  })

  it('NON : une ligne sans source n’y compte pas — la garde ne s’attrape pas elle-même', () => {
    const unsourced = DEMO_DELIVERY_CLIENT.signalsAndNeedsCases.filter(cas => !cas.source)
    expect(unsourced.length).toBeGreaterThan(0)
    expect(unsourced.every(cas => !(OPEN(cas.stage) && cas.source))).toBe(true)
  })

  it('la capacité est classée « seedée », avec sa raison', () => {
    expect(DEMO_ACCOUNT_MISSIONS_COVERAGE.state).toBe('seede')
    expect(DEMO_ACCOUNT_MISSIONS_COVERAGE.reason).toContain('signalsAndNeedsCases')
  })
})
