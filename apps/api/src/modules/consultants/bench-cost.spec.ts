import { computeBenchCost } from './bench-cost'

/**
 * LE COÛT DE L'INTERCONTRAT — TDD, trois cas qui ne se confondent JAMAIS.
 *
 * `long_bench` (`laura-detector.ts`) détecte déjà un consultant en intercontrat
 * depuis plus de 30 jours. Le message dit qu'il EST en intercontrat ; il ne dit
 * pas ce que ça COÛTE — le chiffre qui déclenche l'action.
 *
 * ⚠️ LE PIÈGE : un TJM inconnu n'est PAS un coût de 0 €. C'est un coût NON
 * MESURABLE, et il se dit comme tel, avec le geste qui le débloque (saisir le
 * TJM) — exactement « non mesuré n'est jamais 0 » appliqué à l'intercontrat.
 * Même chose pour une durée inconnue : un TJM connu sur une durée qu'on ignore
 * ne produit AUCUN montant, jamais un montant sur zéro jour.
 */
describe('computeBenchCost — TJM connu, TJM inconnu, durée inconnue : trois cas séparés', () => {
  it('calcule un montant quand le TJM et la durée sont connus (une multiplication)', () => {
    const result = computeBenchCost({ tjm: 500, benchDays: 45 })
    expect(result).toEqual({ measurable: true, amountCents: 500 * 100 * 45 })
  })

  it('coût NON MESURABLE quand le TJM est inconnu — jamais 0 €, avec le geste qui le débloque', () => {
    const result = computeBenchCost({ tjm: null, benchDays: 45 })
    expect(result).toEqual({ measurable: false, reason: 'tjm_missing' })
    // Le piège nommé dans l'énoncé : un `0 €` ici serait le zéro qui ment.
    expect(result).not.toHaveProperty('amountCents')
  })

  it('coût NON MESURABLE quand la durée est inconnue, même avec un TJM connu', () => {
    const result = computeBenchCost({ tjm: 500, benchDays: null })
    expect(result).toEqual({ measurable: false, reason: 'duration_unknown' })
    expect(result).not.toHaveProperty('amountCents')
  })

  it('coût NON MESURABLE quand les DEUX manquent — le TJM manquant est cause première', () => {
    // Choix arbitré et documenté : si les deux manquent, le geste qui débloque
    // le plus (saisir le TJM, qui manque le plus souvent) prime.
    const result = computeBenchCost({ tjm: null, benchDays: null })
    expect(result).toEqual({ measurable: false, reason: 'tjm_missing' })
  })

  it('une durée négative (horloge desynchronisée, saisie erronée) n’est pas mesurable — jamais un montant négatif', () => {
    const result = computeBenchCost({ tjm: 500, benchDays: -3 })
    expect(result).toEqual({ measurable: false, reason: 'duration_unknown' })
  })

  it('une durée de zéro jour est mesurable et vaut 0 — ce n’est PAS le zéro qui ment : la mesure existe, elle vaut zéro', () => {
    const result = computeBenchCost({ tjm: 500, benchDays: 0 })
    expect(result).toEqual({ measurable: true, amountCents: 0 })
  })

  it('garde : un TJM à 0 ou négatif (donnée corrompue) n’est pas traité comme un TJM connu', () => {
    expect(computeBenchCost({ tjm: 0, benchDays: 10 })).toEqual({ measurable: false, reason: 'tjm_missing' })
    expect(computeBenchCost({ tjm: -100, benchDays: 10 })).toEqual({ measurable: false, reason: 'tjm_missing' })
  })
})
