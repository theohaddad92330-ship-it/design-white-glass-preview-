import { describe, expect, it } from 'vitest'
import { partsSourceUtm, STATUT_PROSPECT_DEMO } from './prospects.logic'

/**
 * #2706 — Théo (CEO, 22/09/2026) : « statut Démo lancée » + « la source et
 * les UTM quand ils existent ». Un seul endroit définit le statut (GA-26) ;
 * un UTM absent ne fabrique AUCUNE ligne, jamais un « — » ou un « 0 »
 * (doctrine, Louis 20/09/2026, gardes GA-18/GA-19).
 */
describe('STATUT_PROSPECT_DEMO (#2706.1) — un seul libellé, un seul endroit', () => {
  it('porte le libellé exact demandé par Théo', () => {
    expect(STATUT_PROSPECT_DEMO).toBe('Démo lancée')
  })
})

describe('partsSourceUtm (#2706.2) — la source et les UTM PRÉSENTS seulement', () => {
  it('rend la seule source quand aucun UTM n’existe', () => {
    expect(partsSourceUtm({ source: 'demo' })).toEqual([{ label: 'Source', value: 'demo' }])
  })

  it('n’invente aucune ligne pour un UTM absent — jamais un « — » ni un « 0 »', () => {
    const parts = partsSourceUtm({ source: 'demo', utmSource: undefined, utmCampaign: undefined })
    expect(parts).toEqual([{ label: 'Source', value: 'demo' }])
  })

  it('ajoute chaque UTM présent, dans l’ordre, la source en tête', () => {
    expect(
      partsSourceUtm({
        source: 'demo',
        utmSource: 'linkedin',
        utmMedium: 'social',
        utmCampaign: 'lancement',
        utmTerm: 'esn',
        utmContent: 'banniere',
      }),
    ).toEqual([
      { label: 'Source', value: 'demo' },
      { label: 'UTM source', value: 'linkedin' },
      { label: 'UTM support', value: 'social' },
      { label: 'UTM campagne', value: 'lancement' },
      { label: 'UTM terme', value: 'esn' },
      { label: 'UTM contenu', value: 'banniere' },
    ])
  })

  it('sait dire NON — un seul des cinq UTM présent ne fabrique pas les quatre autres', () => {
    const parts = partsSourceUtm({ source: 'demo', utmCampaign: 'lancement' })
    expect(parts).toEqual([
      { label: 'Source', value: 'demo' },
      { label: 'UTM campagne', value: 'lancement' },
    ])
  })
})
