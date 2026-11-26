import { describe, expect, it } from 'vitest'
import {
  CLIENT_BASE_CAPITALIZATION_LINKS,
  deriveClientBaseCapitalizationSignals,
  describeCapitalizationGap,
} from './client-base-capitalization.js'

/**
 * GOLDEN — #2047.13 → .18 : ce que l'audit MESURE à partir de la base de
 * clients déclarée, jamais un score unique qui fondrait les six liens.
 *
 * Trois gardes précises :
 *  1. sait dire NON — une réponse ABSENTE ne devient jamais `'non_observe'` ;
 *  2. lit quelque chose — le corpus des six liens n'est pas vide ;
 *  3. le ton de #2047.18 : jamais accusatoire (« échec », « raté »…), le
 *     libellé nomme une opportunité qui reste à saisir.
 */
describe('deriveClientBaseCapitalizationSignals', () => {
  it("le corpus des liens n'est pas vide", () => {
    expect(CLIENT_BASE_CAPITALIZATION_LINKS.length).toBeGreaterThanOrEqual(6)
  })

  it("une réponse ABSENTE reste 'inconnu', jamais 'non_observe' (non mesuré n'est jamais 0)", () => {
    const signals = deriveClientBaseCapitalizationSignals({})
    for (const link of CLIENT_BASE_CAPITALIZATION_LINKS) {
      expect(signals[link], `${link} devrait rester inconnu`).toBe('inconnu')
    }
  })

  it("sait dire NON : une bande déclarée 'aucun'/'jamais' rend 'non_observe', pas 'inconnu'", () => {
    const signals = deriveClientBaseCapitalizationSignals({
      client_base_renewals_band: 'aucun',
      client_base_cross_sell_band: 'jamais_tente',
      client_base_referrals_band: 'aucune',
      client_base_case_studies_band: '0',
      client_base_rex_band: 'jamais',
    })
    expect(signals.renewal).toBe('non_observe')
    expect(signals.newNeed).toBe('non_observe')
    expect(signals.referral).toBe('non_observe')
    expect(signals.testimonial).toBe('non_observe')
    expect(signals.talentPool).toBe('non_observe')
    expect(signals.content).toBe('non_observe')
  })

  it('une bande déclarée POSITIVE rend `observe`', () => {
    const signals = deriveClientBaseCapitalizationSignals({
      client_base_renewals_band: 'la_plupart',
      client_base_cross_sell_band: 'pratique_reguliere',
      client_base_referrals_band: 'regulierement',
      client_base_case_studies_band: '1-5',
      client_base_rex_band: 'systematique',
    })
    expect(signals.renewal).toBe('observe')
    expect(signals.newNeed).toBe('observe')
    expect(signals.referral).toBe('observe')
    expect(signals.testimonial).toBe('observe')
    expect(signals.talentPool).toBe('observe')
    expect(signals.content).toBe('observe')
  })

  it('#2047.18 — le libellé du manque ne nomme jamais un échec', () => {
    const forbidden = /échec|rat[ée]|faute|mauvais/i
    for (const link of CLIENT_BASE_CAPITALIZATION_LINKS) {
      const label = describeCapitalizationGap(link)
      expect(label, `${link}: ${label}`).not.toMatch(forbidden)
      expect(label).toContain('opportunité')
    }
  })
})
