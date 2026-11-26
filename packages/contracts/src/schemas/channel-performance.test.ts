import { describe, expect, it } from 'vitest'
import {
  CHANNEL_MIN_SAMPLE,
  CHANNEL_REPLY_WINDOW_DAYS,
  channelPerformanceListSchema,
  toChannelPerformance,
} from './channel-performance.js'

/**
 * #3278.3 (#3259.7) — les presets de canal cèdent devant le MESURÉ : ce
 * fichier ne mesure rien lui-même, il fixe la forme du fait mesuré (envoyés,
 * répondus sous la fenêtre) et le seuil sous lequel un canal reste « non
 * mesuré » — jamais un taux à 0 faute d'envois.
 */
describe('toChannelPerformance', () => {
  it('garde le seuil et la fenêtre en UN seul endroit', () => {
    expect(CHANNEL_MIN_SAMPLE).toBe(10)
    expect(CHANNEL_REPLY_WINDOW_DAYS).toBe(14)
  })

  it('marque un canal suffisant à partir du seuil, avec son taux entier', () => {
    const [row] = toChannelPerformance([{ channel: 'call', sent: 20, replied: 8 }])
    expect(row).toEqual({ channel: 'call', sent: 20, replied: 8, sufficient: true, replyRate: 40 })
  })

  it('un canal sous le seuil est NON MESURÉ : pas de taux, jamais 0', () => {
    const [row] = toChannelPerformance([{ channel: 'email', sent: 4, replied: 0 }])
    expect(row.sufficient).toBe(false)
    expect(row.replyRate).toBeNull()
  })

  it('ignore un canal inconnu et un canal sans aucun envoi (aucune ligne pour une absence)', () => {
    const rows = toChannelPerformance([
      { channel: 'fax', sent: 50, replied: 50 },
      { channel: 'linkedin', sent: 0, replied: 0 },
    ])
    expect(rows).toEqual([])
  })

  it('refuse un répondu supérieur à l’envoyé (la donnée ne ment pas)', () => {
    expect(() => toChannelPerformance([{ channel: 'call', sent: 3, replied: 5 }])).toThrow()
  })

  it('le schéma rejette un taux sans échantillon suffisant', () => {
    const parsed = channelPerformanceListSchema.safeParse([
      { channel: 'call', sent: 3, replied: 1, sufficient: false, replyRate: 33 },
    ])
    expect(parsed.success).toBe(false)
  })
})
