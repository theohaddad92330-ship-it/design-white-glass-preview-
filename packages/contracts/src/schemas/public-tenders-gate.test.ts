import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PUBLIC_SOURCE_IDS } from './market-verification.js'
import { PUBLIC_TENDERS_GATE, PUBLIC_TENDER_SOURCE_IDS, forecastPublicTenderSources } from './public-tenders-gate.js'

// #2288.4 (c66) — le devis ne nomme BOAMP/DECP que là où la collecte les
// interrogera VRAIMENT. La règle vit dans `collection_focus.py` ; ce fichier en
// porte le seul morceau décidable AVANT le run, et `test_collection_focus.py`
// vérifie que le Python dit ce que dit le JSON partagé.

describe('forecastPublicTenderSources — le devis dit ce que la gate de collecte fera (#2288.4)', () => {
  it('une entreprise PUBLIQUE connue (NAF 84), marché France : BOAMP et DECP sont annoncés', () => {
    expect(forecastPublicTenderSources({ runCountry: null, knownNafCode: '84.11Z' })).toEqual(['boamp', 'decp'])
  })

  it('une entreprise INCONNUE (aucun NAF persisté) : rien n’est annoncé — jamais une source devinée', () => {
    expect(forecastPublicTenderSources({ runCountry: null, knownNafCode: null })).toEqual([])
  })

  it('un NAF qui ne FIXE pas l’archétype (62.01Z) : rien — c’est le libellé du registre qui trancherait, au run', () => {
    expect(forecastPublicTenderSources({ runCountry: null, knownNafCode: '62.01Z' })).toEqual([])
  })

  it('un marché HORS France : rien, même pour un compte public — la gate écarte les marchés publics FR', () => {
    expect(forecastPublicTenderSources({ runCountry: 'CH', knownNafCode: '84.11Z' })).toEqual([])
  })

  it('« FR » écrit en clair vaut la France, comme côté IA (casse et blancs ignorés)', () => {
    expect(forecastPublicTenderSources({ runCountry: ' FR ', knownNafCode: '8411Z' })).toEqual(['boamp', 'decp'])
  })

  it('toute division qui fixe un archétype gardé annonce, et elle seule — la garde sait dire OUI et NON', () => {
    for (const [division, archetype] of Object.entries(PUBLIC_TENDERS_GATE.nafDivisionToArchetype)) {
      const excluded = (PUBLIC_TENDERS_GATE.archetypesWithoutPublicTenders as readonly string[]).includes(archetype)
      expect(forecastPublicTenderSources({ runCountry: null, knownNafCode: `${division}.10Z` })).toEqual(
        excluded ? [] : PUBLIC_TENDER_SOURCE_IDS,
      )
    }
  })

  it('les sources annoncées sont des sources PUBLIQUES du registre c66', () => {
    for (const id of PUBLIC_TENDER_SOURCE_IDS) expect(PUBLIC_SOURCE_IDS).toContain(id)
  })
})

describe('la gate de collecte — la parité avec le service IA', () => {
  const snapshot = JSON.parse(
    readFileSync(new URL('./public-tenders-gate.constants.json', import.meta.url), 'utf8'),
  ) as typeof PUBLIC_TENDERS_GATE

  it('le JSON partagé dit EXACTEMENT ce que dit ce fichier', () => {
    expect(snapshot).toEqual(JSON.parse(JSON.stringify(PUBLIC_TENDERS_GATE)))
  })

  it('et ce JSON porte un corpus NON VIDE — la preuve que la parité LIT quelque chose', () => {
    expect(Object.keys(snapshot.nafDivisionToArchetype).length).toBeGreaterThanOrEqual(40)
    expect(snapshot.nafDivisionToArchetype['84']).toBe('public')
    expect(snapshot.archetypesWithoutPublicTenders).toEqual(['international', 'startup'])
    expect(snapshot.frenchCountries).toContain('fr')
  })
})
