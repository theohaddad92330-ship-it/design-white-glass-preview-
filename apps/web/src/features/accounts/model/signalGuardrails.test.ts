import { describe, expect, it } from 'vitest'
import { evaluateSignalOfferRelevance } from './signalGuardrails'

// #2952 (#2305.30/.31/.33/.34) — les quatre exemples de garde-fous anti-conflation
// de LAU-FINAL-046, tels quels.
describe('evaluateSignalOfferRelevance', () => {
  it('bloque un recrutement CDI lu comme un besoin freelance (#2305.30)', () => {
    const result = evaluateSignalOfferRelevance({ type: 'recrutement', signal: 'Recrute 5 développeurs en CDI' })
    expect(result.relevant).toBe(false)
    expect(result.blockedBy).toContain('cdi_not_freelance')
  })

  it('bloque une nouvelle usine lue comme un appel immédiat à une ESN (#2305.31)', () => {
    const result = evaluateSignalOfferRelevance({
      type: 'investissement',
      signal: 'Inauguration d’une nouvelle usine à Lyon',
    })
    expect(result.relevant).toBe(false)
    expect(result.blockedBy).toContain('factory_not_immediate_esn')
  })

  it('bloque un budget groupe lu comme disponible en filiale (#2305.33)', () => {
    const result = evaluateSignalOfferRelevance({ type: 'budget', signal: 'Le groupe annonce un budget IT de 50M€' })
    expect(result.relevant).toBe(false)
    expect(result.blockedBy).toContain('group_budget_not_subsidiary')
  })

  it("bloque une nomination de dirigeant lue comme un besoin d'achat (#2305.34)", () => {
    const result = evaluateSignalOfferRelevance({ type: 'nomination', signal: 'Jean Dupont nommé DSI du groupe' })
    expect(result.relevant).toBe(false)
    expect(result.blockedBy).toContain('executive_appointment_not_purchase')
  })

  it('ne bloque pas un signal ordinaire ne portant aucun des quatre marqueurs', () => {
    const result = evaluateSignalOfferRelevance({
      type: 'appel_offres',
      signal: 'Publie un appel d’offres pour sa refonte SI',
    })
    expect(result).toEqual({ relevant: true, blockedBy: [] })
  })

  it('un budget de filiale (sans mention groupe) reste pertinent', () => {
    const result = evaluateSignalOfferRelevance({
      type: 'budget',
      signal: 'La filiale débloque un budget cloud de 2M€',
    })
    expect(result.relevant).toBe(true)
  })

  it('un recrutement CDI sans lien apparent avec une offre externe reste pertinent si aucun autre marqueur', () => {
    const result = evaluateSignalOfferRelevance({ type: 'recrutement', signal: 'Recrute 5 développeurs en régie' })
    expect(result.blockedBy).not.toContain('cdi_not_freelance')
  })

  it('cumule plusieurs garde-fous quand plusieurs marqueurs sont présents', () => {
    const result = evaluateSignalOfferRelevance({
      type: 'nomination',
      signal: 'Le groupe nomme un nouveau DAF, budget groupe à réaffecter',
    })
    expect(result.blockedBy).toEqual(
      expect.arrayContaining(['group_budget_not_subsidiary', 'executive_appointment_not_purchase']),
    )
  })
})
