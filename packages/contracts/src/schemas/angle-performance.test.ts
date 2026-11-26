import { describe, expect, it } from 'vitest'
import { CHANNEL_MIN_SAMPLE } from './channel-performance.js'
import { normalizeAngleLabel, toAnglePerformance } from './angle-performance.js'

/**
 * #3211.11 (#3234, lot RAISON-B 12/10) — la même mesure, coupée par ANGLE du
 * message (la raison portée par le brouillon). Même seuil que les canaux ; un
 * envoi sans angle connu ne fait aucune ligne.
 */
describe('normalizeAngleLabel', () => {
  it('rend la même étiquette pour la même formulation, casse et espaces compris', () => {
    expect(normalizeAngleLabel('  Suite au   POC ')).toBe('suite au poc')
  })

  it('rend null pour une raison vide : une absence ne fait aucune ligne', () => {
    expect(normalizeAngleLabel('   ')).toBeNull()
    expect(normalizeAngleLabel(null)).toBeNull()
  })

  it('borne la longueur de l’étiquette', () => {
    expect(normalizeAngleLabel('a'.repeat(300))?.length).toBe(80)
  })
})

describe('toAnglePerformance', () => {
  it('applique le seuil des canaux : sous dix envois, pas de taux', () => {
    expect(
      toAnglePerformance([
        { angle: 'suite au poc', sent: CHANNEL_MIN_SAMPLE, replied: 4 },
        { angle: 'invitation webinaire', sent: CHANNEL_MIN_SAMPLE - 1, replied: 0 },
      ]),
    ).toEqual([
      { angle: 'suite au poc', sent: 10, replied: 4, sufficient: true, replyRate: 40 },
      { angle: 'invitation webinaire', sent: 9, replied: 0, sufficient: false, replyRate: null },
    ])
  })

  it('fusionne les formulations équivalentes et écarte angle vide ou sans envoi', () => {
    expect(
      toAnglePerformance([
        { angle: 'Suite au POC', sent: 6, replied: 2 },
        { angle: 'suite au  poc', sent: 5, replied: 1 },
        { angle: '', sent: 20, replied: 5 },
        { angle: 'x', sent: 0, replied: 0 },
      ]),
    ).toEqual([{ angle: 'suite au poc', sent: 11, replied: 3, sufficient: true, replyRate: 27 }])
  })
})
