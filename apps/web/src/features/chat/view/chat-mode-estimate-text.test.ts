import { describe, expect, it } from 'vitest'
import { chatModeEstimateAnnouncement } from './chat-mode-estimate-text'

describe('chatModeEstimateAnnouncement', () => {
  it('rend la ligne « non mesurée » sans estimation', () => {
    expect(chatModeEstimateAnnouncement(null)).toEqual({ key: 'composer.researchMode.estimate.unknown' })
  })

  it('annonce la durée seule quand le coût n’est pas mesuré', () => {
    const result = chatModeEstimateAnnouncement({
      durationMs: 8_200,
      sampleSize: 14,
      cost: { measured: false },
    })

    expect(result).toEqual({ key: 'composer.researchMode.estimate.duration', params: { seconds: 8, sampleSize: 14 } })
  })

  it('annonce durée ET coût quand les deux sont mesurés', () => {
    const result = chatModeEstimateAnnouncement({
      durationMs: 5_600,
      sampleSize: 20,
      cost: { measured: true, avgCostUsd: 0.032 },
    })

    expect(result).toEqual({
      key: 'composer.researchMode.estimate.durationAndCost',
      params: { seconds: 6, cost: '0.03', sampleSize: 20 },
    })
  })

  it('un coût réel sous 0,01 $ se dit « < 0,01 », jamais 0,00 (GA-18/19)', () => {
    const result = chatModeEstimateAnnouncement({
      durationMs: 4_000,
      sampleSize: 9,
      cost: { measured: true, avgCostUsd: 0.0003 },
    })

    expect(result).toEqual({
      key: 'composer.researchMode.estimate.durationAndCost',
      params: { seconds: 4, cost: '< 0,01', sampleSize: 9 },
    })
  })

  describe('une durée RÉELLE mais sous la seconde ne rend jamais un 0 chiffré', () => {
    it('bascule sur la clé dédiée, sans coût', () => {
      const result = chatModeEstimateAnnouncement({ durationMs: 320, sampleSize: 5, cost: { measured: false } })

      expect(result).toEqual({ key: 'composer.researchMode.estimate.durationUnderSecond', params: { sampleSize: 5 } })
    })

    it('bascule sur la clé dédiée, avec coût', () => {
      const result = chatModeEstimateAnnouncement({
        durationMs: 120,
        sampleSize: 6,
        cost: { measured: true, avgCostUsd: 0.05 },
      })

      expect(result).toEqual({
        key: 'composer.researchMode.estimate.durationUnderSecondAndCost',
        params: { cost: '0.05', sampleSize: 6 },
      })
    })

    it("n'atteint jamais `seconds: 0`", () => {
      for (const durationMs of [0, 1, 100, 320, 499]) {
        const result = chatModeEstimateAnnouncement({ durationMs, sampleSize: 5, cost: { measured: false } })
        if ('params' in result && 'seconds' in result.params) expect(result.params.seconds).not.toBe(0)
      }
    })

    it('500 ms pile arrondit à 1 s — reste sur la clé chiffrée normale', () => {
      const result = chatModeEstimateAnnouncement({ durationMs: 500, sampleSize: 5, cost: { measured: false } })

      expect(result).toEqual({ key: 'composer.researchMode.estimate.duration', params: { seconds: 1, sampleSize: 5 } })
    })
  })
})
