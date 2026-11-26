import { MATURITY_LEVELS, stagesOfMaturity, maturityOfStage } from './maturity-tabs'

/**
 * #1330 (3/7) — « Les onglets actuels manquent de clarté. Garder une structure
 * lisible en 3 niveaux maximum : Confirmé / À qualifier / Détecté. Éviter les
 * libellés trop proches les uns des autres ("projets qualifiés", "projets
 * plausibles", "signaux"), qui demandent un effort mental inutile. »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI CHANGE, ET CE QUI NE CHANGE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Les QUATRE étapes du contrat ne bougent pas : elles portent des définitions
 * que le produit tient ailleurs — « signal : un fait daté et sourcé, il annonce
 * peut-être un besoin, il n'en est pas un » · « confirmé : la seule position qui
 * mérite le mot besoin ». Les fondre serait perdre cette distinction.
 *
 * Seul le REGROUPEMENT des onglets change : `qualified` et `plausible` sont
 * deux façons de dire « à creuser », et c'est ce que ton deuxième libellé
 * proposait — « Opportunités à creuser ». Chaque ligne garde son étiquette
 * d'étape exacte : le regroupement guide le regard, il n'efface rien.
 */
describe('les trois niveaux de maturité', () => {
  it('sont exactement trois — pas cinq onglets', () => {
    expect(MATURITY_LEVELS).toHaveLength(3)
  })

  it('vont du plus engageant au moins engageant', () => {
    expect(MATURITY_LEVELS).toEqual(['confirmed', 'to_dig', 'detected'])
  })

  it('« confirmé » ne contient QUE l’étape qui mérite le mot besoin', () => {
    expect(stagesOfMaturity('confirmed')).toEqual(['confirmed'])
  })

  it('« à creuser » regroupe les deux étapes intermédiaires', () => {
    expect(stagesOfMaturity('to_dig')).toEqual(['qualified', 'plausible'])
  })

  it('« détecté » ne contient que le signal — un fait, pas un besoin', () => {
    expect(stagesOfMaturity('detected')).toEqual(['signal'])
  })

  it('couvre les QUATRE étapes, sans recouvrement ni oubli', () => {
    // Une étape dans deux niveaux se compterait deux fois ; une étape dans
    // aucun disparaîtrait de l'écran.
    const toutes = MATURITY_LEVELS.flatMap(stagesOfMaturity)

    expect([...toutes].sort()).toEqual(['confirmed', 'plausible', 'qualified', 'signal'])
  })

  it('chaque étape retrouve son niveau — la lecture marche dans les deux sens', () => {
    expect(maturityOfStage('confirmed')).toBe('confirmed')
    expect(maturityOfStage('qualified')).toBe('to_dig')
    expect(maturityOfStage('plausible')).toBe('to_dig')
    expect(maturityOfStage('signal')).toBe('detected')
  })
})
