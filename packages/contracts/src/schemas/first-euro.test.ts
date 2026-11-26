import { describe, expect, it } from 'vitest'
import { MEASURABILITY_THRESHOLDS } from './measurability.js'
import { FIRST_EURO_STEPS, distanceToFirstEuro, type FirstEuroStep } from './first-euro.js'

/**
 * LA DISTANCE AU PREMIER EURO — PDF 2 §7.4, ticket `BEL-ACC-107` PR4.
 *
 * « On classe par intérêt ou par accessibilité. Aucun des deux ne dit combien
 * d'étapes restent avant une facture. »
 * « Un compte à 3 étapes bat un compte à 8, même moins intéressant. »
 *
 * Et la règle d'honnêteté, qui EST l'exigence :
 * « `estimatedDays` est null tant que l'espace n'a pas 10 missions closes. On
 * ne devine pas un délai médian sur 2 observations. »
 */

const ALL: Record<FirstEuroStep, number> = {
  contact_identified: 3,
  reply_obtained: 5,
  need_expressed: 7,
  profile_sent: 4,
  interview: 6,
  agreement: 8,
  mission_started: 10,
  first_invoice: 30,
}

const ENOUGH = MEASURABILITY_THRESHOLDS.firstEuroDelay

describe('FIRST_EURO_STEPS — les huit étapes de la source, dans son ordre', () => {
  it('porte exactement les huit étapes', () => {
    expect([...FIRST_EURO_STEPS]).toEqual([
      'contact_identified',
      'reply_obtained',
      'need_expressed',
      'profile_sent',
      'interview',
      'agreement',
      'mission_started',
      'first_invoice',
    ])
  })
})

describe('distanceToFirstEuro', () => {
  it('compte les étapes RESTANTES et nomme la prochaine', () => {
    const result = distanceToFirstEuro({
      reached: ['contact_identified', 'reply_obtained', 'need_expressed', 'profile_sent', 'interview'],
      medianDaysByStep: ALL,
      closedMissions: ENOUGH,
    })

    expect(result.steps).toBe(3)
    expect(result.nextStep).toBe('agreement')
    expect(result.estimatedDays).toBe(8 + 10 + 30)
  })

  it('un compte à 3 étapes bat un compte à 8 — c’est le tri que la source demande', () => {
    const near = distanceToFirstEuro({
      reached: ['contact_identified', 'reply_obtained', 'need_expressed', 'profile_sent', 'interview'],
      medianDaysByStep: ALL,
      closedMissions: ENOUGH,
    })
    const far = distanceToFirstEuro({ reached: [], medianDaysByStep: ALL, closedMissions: ENOUGH })

    expect(near.steps).toBeLessThan(far.steps)
    expect(far.steps).toBe(8)
    expect(far.nextStep).toBe('contact_identified')
  })

  /**
   * ⚠️ LE CŒUR DE L'EXIGENCE. Sous le seuil, l'écran dit « pas assez
   * d'historique pour estimer » — jamais un nombre, JAMAIS zéro. Un zéro se
   * lirait « la facture part demain ».
   */
  it('sous dix missions closes, `estimatedDays` vaut null — jamais 0', () => {
    for (const closed of [0, 1, 2, ENOUGH - 1]) {
      const result = distanceToFirstEuro({ reached: [], medianDaysByStep: ALL, closedMissions: closed })
      expect(result.estimatedDays).toBeNull()
      // Le COMPTE d'étapes, lui, reste juste : il ne dépend d'aucune médiane.
      expect(result.steps).toBe(8)
      expect(result.measurability.measurable).toBe(false)
      expect(result.measurability.missing).toBe(ENOUGH - closed)
    }
  })

  it('dit COMBIEN il manque d’observations — un écran muet fait chercher une panne', () => {
    const result = distanceToFirstEuro({ reached: [], medianDaysByStep: ALL, closedMissions: 3 })
    expect(result.measurability).toEqual({ measurable: false, observed: 3, required: ENOUGH, missing: ENOUGH - 3 })
  })

  it('une étape restante SANS médiane observée rend `estimatedDays` null, et la NOMME', () => {
    // Sommer ce qu'on connaît sous-estimerait le délai, et un délai
    // sous-estimé est plus dangereux qu'un délai absent : il fait promettre
    // une date à un client.
    const { agreement: _dropped, ...partial } = ALL
    const result = distanceToFirstEuro({
      reached: ['contact_identified'],
      medianDaysByStep: partial,
      closedMissions: ENOUGH,
    })

    expect(result.estimatedDays).toBeNull()
    expect(result.unmeasuredSteps).toEqual(['agreement'])
  })

  it('une étape déjà FRANCHIE sans médiane ne gêne pas — on ne l’attend plus', () => {
    const { contact_identified: _dropped, ...partial } = ALL
    const result = distanceToFirstEuro({
      reached: ['contact_identified'],
      medianDaysByStep: partial,
      closedMissions: ENOUGH,
    })

    expect(result.unmeasuredSteps).toEqual([])
    expect(result.estimatedDays).toBe(5 + 7 + 4 + 6 + 8 + 10 + 30)
  })

  it('un compte arrivé au bout n’a plus d’étape, plus de prochaine, et zéro jour', () => {
    const result = distanceToFirstEuro({
      reached: [...FIRST_EURO_STEPS],
      medianDaysByStep: ALL,
      closedMissions: ENOUGH,
    })

    expect(result.steps).toBe(0)
    expect(result.nextStep).toBeNull()
    // Ici `0` est VRAI : il ne reste rien à franchir. Ce n'est pas une absence.
    expect(result.estimatedDays).toBe(0)
  })

  /**
   * Une étape franchie ALORS QUE la précédente ne l'est pas se produit
   * réellement : un besoin arrive par un partenaire avant qu'on ait parlé à
   * qui que ce soit. On ne « rattrape » pas les étapes manquées — les compter
   * comme franchies raccourcirait la distance sur la foi d'un raisonnement,
   * pas d'un fait.
   */
  it('ne déduit RIEN d’une étape franchie hors ordre', () => {
    const result = distanceToFirstEuro({
      reached: ['need_expressed'],
      medianDaysByStep: ALL,
      closedMissions: ENOUGH,
    })

    expect(result.steps).toBe(7)
    expect(result.nextStep).toBe('contact_identified')
  })

  it('une médiane négative ou illisible est ignorée comme absente', () => {
    const result = distanceToFirstEuro({
      reached: [],
      medianDaysByStep: { ...ALL, interview: Number.NaN },
      closedMissions: ENOUGH,
    })
    expect(result.estimatedDays).toBeNull()
    expect(result.unmeasuredSteps).toEqual(['interview'])
  })
})
