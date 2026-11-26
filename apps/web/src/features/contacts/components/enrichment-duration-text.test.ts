import { describe, expect, it } from 'vitest'
import { enrichmentDurationAnnouncement } from './enrichment-duration-text'

/**
 * #2120.57 / #2297.23 — ce qu'annonce le dialogue, à partir de la médiane
 * serveur (ou de son absence).
 */
describe('enrichmentDurationAnnouncement', () => {
  it('rend la ligne « non mesurée » quand il n’y a pas de médiane', () => {
    expect(enrichmentDurationAnnouncement(null, 1)).toEqual({ key: 'enrich.confirm.durationUnknown' })
  })

  it('rend la ligne « non mesurée » même pour un lot, sans médiane', () => {
    expect(enrichmentDurationAnnouncement(null, 12)).toEqual({ key: 'enrich.confirm.durationUnknown' })
  })

  it('annonce la médiane pour UN seul contact (count absent — recherche)', () => {
    const result = enrichmentDurationAnnouncement({ medianMs: 32_400, sampleSize: 18 }, undefined)

    expect(result).toEqual({
      key: 'enrich.confirm.durationEstimated',
      params: { seconds: 32, sampleSize: 18 },
    })
  })

  it('annonce la médiane pour UN seul contact (count = 1)', () => {
    const result = enrichmentDurationAnnouncement({ medianMs: 29_600, sampleSize: 7 }, 1)

    expect(result).toEqual({
      key: 'enrich.confirm.durationEstimated',
      params: { seconds: 30, sampleSize: 7 },
    })
  })

  it('annonce un taux PAR CONTACT pour un LOT (count > 1) — jamais un total inventé', () => {
    const result = enrichmentDurationAnnouncement({ medianMs: 35_000, sampleSize: 50 }, 8)

    expect(result).toEqual({
      key: 'enrich.confirm.durationEstimatedBulk',
      params: { seconds: 35, count: 8 },
    })
  })

  /**
   * #2120.57 / #2297.23 — mesuré en production le 20/09 : une médiane sous
   * 500 ms arrondissait à `0`, et l'écran affichait « environ 0 s » — le
   * zéro interdit que le commentaire du fichier promet déjà d'éviter côté
   * « non mesuré » (GA-18/19), mais pas côté MESURÉ. Une durée réelle sous
   * la seconde reste réelle : elle se dit autrement, jamais « 0 ».
   */
  describe('une médiane RÉELLE mais sous la seconde ne rend jamais un 0 chiffré', () => {
    it('bascule sur une clé dédiée sous 500 ms (arrondirait à 0 s)', () => {
      const result = enrichmentDurationAnnouncement({ medianMs: 320, sampleSize: 7 }, 1)

      expect(result).toEqual({
        key: 'enrich.confirm.durationEstimatedUnderSecond',
        params: { sampleSize: 7 },
      })
    })

    it('même bascule pour un LOT (count > 1)', () => {
      const result = enrichmentDurationAnnouncement({ medianMs: 10, sampleSize: 6 }, 8)

      expect(result).toEqual({
        key: 'enrich.confirm.durationEstimatedBulkUnderSecond',
        params: { count: 8 },
      })
    })

    it("n'atteint JAMAIS `seconds: 0`, quelle que soit la médiane sous la seconde", () => {
      for (const medianMs of [0, 1, 100, 320, 499]) {
        const result = enrichmentDurationAnnouncement({ medianMs, sampleSize: 7 }, 1)
        if ('params' in result && 'seconds' in result.params) expect(result.params.seconds).not.toBe(0)
      }
    })

    it('500 ms pile arrondirait à 1 s — reste sur la clé chiffrée normale', () => {
      const result = enrichmentDurationAnnouncement({ medianMs: 500, sampleSize: 7 }, 1)

      expect(result).toEqual({
        key: 'enrich.confirm.durationEstimated',
        params: { seconds: 1, sampleSize: 7 },
      })
    })
  })
})
