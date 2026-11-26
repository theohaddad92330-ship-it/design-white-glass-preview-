import { describe, expect, it } from 'vitest'
import { campaignStepDailyCapReached } from './outreach-sequence.js'

/**
 * #2909 (#2378.2) — le plafond de volume PAR ÉTAPE, agrégé par campagne
 * (`campaign_label`, c74) puisque chaque séquence reste mono-contact.
 */
describe('campaignStepDailyCapReached — un plafond éteint par défaut, jamais bloquant tout seul', () => {
  it('aucun plafond réglé (`null`) : jamais atteint, quel que soit le compte du jour', () => {
    expect(campaignStepDailyCapReached(0, null)).toBe(false)
    expect(campaignStepDailyCapReached(9_999, null)).toBe(false)
  })

  it('sous le plafond : pas encore atteint', () => {
    expect(campaignStepDailyCapReached(4, 5)).toBe(false)
  })

  it('au plafond : atteint — le compte du jour égale la limite', () => {
    expect(campaignStepDailyCapReached(5, 5)).toBe(true)
  })

  it('au-delà du plafond : reste atteint', () => {
    expect(campaignStepDailyCapReached(6, 5)).toBe(true)
  })

  it('un plafond à zéro est atteint dès le premier envoi du jour', () => {
    expect(campaignStepDailyCapReached(0, 0)).toBe(true)
  })
})
