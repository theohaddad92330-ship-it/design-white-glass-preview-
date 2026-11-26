import { describe, expect, it } from 'vitest'
import { CHANNEL_MIN_SAMPLE } from './channel-performance.js'
import { toRolePerformance } from './role-performance.js'

/**
 * #3234 (#3211.11, lot Z17) — la même mesure, coupée par RÔLE de décision du
 * contact : même fenêtre, même seuil (un seul endroit, GA-26). Un rôle isolé
 * sous le seuil reste « non mesuré » — un échec isolé ne se généralise pas.
 */
describe('toRolePerformance', () => {
  it('applique le seuil des canaux : sous dix envois, pas de taux', () => {
    expect(
      toRolePerformance([
        { role: 'technical', sent: CHANNEL_MIN_SAMPLE, replied: 3 },
        { role: 'economic', sent: CHANNEL_MIN_SAMPLE - 1, replied: 0 },
      ]),
    ).toEqual([
      { role: 'technical', sent: 10, replied: 3, sufficient: true, replyRate: 30 },
      { role: 'economic', sent: 9, replied: 0, sufficient: false, replyRate: null },
    ])
  })

  it('écarte un rôle inconnu ou vide et un rôle sans envoi (une absence ne fait aucune ligne)', () => {
    expect(
      toRolePerformance([
        { role: '', sent: 20, replied: 5 },
        { role: 'inconnu', sent: 20, replied: 5 },
        { role: 'technical', sent: 0, replied: 0 },
      ]),
    ).toEqual([])
  })
})
