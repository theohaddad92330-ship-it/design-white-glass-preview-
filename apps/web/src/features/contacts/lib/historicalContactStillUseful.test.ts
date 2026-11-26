import { describe, expect, it } from 'vitest'
import { historicalContactStillUsefulAs } from './historicalContactStillUseful'

// #2296.23/.25/.26 (LAU-FINAL-037) — « une ancienne relation reste utile
// comme réseau dormant, historique du compte, source d'information
// potentielle » : un fait CONSTANT de l'état `historique`, jamais une mesure
// par contact.
describe('historicalContactStillUsefulAs', () => {
  it('#2296.23/.25/.26 — lifecycle_state historique → les trois usages nommés', () => {
    expect(historicalContactStillUsefulAs({ lifecycle_state: 'historique' })).toEqual([
      'dormant_network',
      'account_history',
      'potential_source',
    ])
  })

  it('#2296.27 — un contact actif ne porte aucun usage « ancienne relation »', () => {
    expect(historicalContactStillUsefulAs({ lifecycle_state: 'actionnable' })).toBeNull()
  })

  it('lifecycle_state absent (fiche antérieure au backfill) → non mesuré, jamais deviné', () => {
    expect(historicalContactStillUsefulAs({ lifecycle_state: null })).toBeNull()
  })
})
