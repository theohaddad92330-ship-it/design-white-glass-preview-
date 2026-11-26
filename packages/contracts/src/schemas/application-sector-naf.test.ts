import { describe, expect, it } from 'vitest'
import { APPLICATION_SECTORS, APPLICATION_SECTOR_GROUPS } from './application-sectors.js'
import {
  APPLICATION_SECTOR_NAF,
  nafCodesForSectors,
  nafPrefixesForSectors,
  sectorCodesForGroup,
} from './application-sector-naf.js'

describe('application-sector-naf', () => {
  it('couvre TOUS les secteurs du vocabulaire partagé — un secteur sans NAF ne filtrerait rien', () => {
    const missing = APPLICATION_SECTORS.filter(s => (APPLICATION_SECTOR_NAF[s.code] ?? []).length === 0)
    expect(missing.map(s => s.code)).toEqual([])
  })

  it("n'invente aucun secteur — chaque clé existe dans le vocabulaire partagé", () => {
    const known = new Set(APPLICATION_SECTORS.map(s => s.code))
    expect(Object.keys(APPLICATION_SECTOR_NAF).filter(code => !known.has(code))).toEqual([])
  })

  it('ne porte que des codes de CLASSE complets — le registre refuse un préfixe', () => {
    const bad: string[] = []
    for (const codes of Object.values(APPLICATION_SECTOR_NAF)) {
      for (const naf of codes) if (!/^\d{2}\.\d{2}[A-Z]$/.test(naf)) bad.push(naf)
    }
    expect(bad).toEqual([])
  })

  it('ne répète pas un code dans un même secteur', () => {
    const dupes: string[] = []
    for (const [sector, codes] of Object.entries(APPLICATION_SECTOR_NAF)) {
      if (new Set(codes).size !== codes.length) dupes.push(sector)
    }
    expect(dupes).toEqual([])
  })

  it('rend les codes de plusieurs secteurs dédupliqués — deux secteurs partagent parfois un code', () => {
    // 21.10Z (fabrication de produits pharmaceutiques de base) est à la fois de
    // la production pharma et des sciences du vivant : c'est un fait, pas un bug.
    const codes = nafCodesForSectors(['pharma_manufacturing', 'life_sciences'])
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes).toContain('21.10Z')
  })

  it('ignore un secteur inconnu plutôt que de rendre une liste vide qui viderait la recherche', () => {
    expect(nafCodesForSectors(['aerospace', 'secteur_qui_nexiste_pas'])).toEqual(['30.30Z'])
  })

  it('rend une liste VIDE pour aucun secteur — vide veut dire « aucune contrainte », jamais « rien »', () => {
    expect(nafCodesForSectors([])).toEqual([])
  })

  it('rend les préfixes à 4 chiffres pour CLASSER un code déjà connu', () => {
    // Le pendant de `esn_naf.py` : les codes complets INTERROGENT, les préfixes CLASSENT.
    expect(nafPrefixesForSectors(['aerospace'])).toEqual(['3030'])
  })

  it('chaque groupe porte au moins un secteur — un groupe vide serait une puce morte', () => {
    for (const group of APPLICATION_SECTOR_GROUPS) {
      expect(sectorCodesForGroup(group).length).toBeGreaterThan(0)
    }
  })

  it("les secteurs d'un groupe sont exactement ceux du vocabulaire partagé", () => {
    for (const group of APPLICATION_SECTOR_GROUPS) {
      expect(sectorCodesForGroup(group)).toEqual(APPLICATION_SECTORS.filter(s => s.group === group).map(s => s.code))
    }
  })
  // #4358 — « J'ai sélectionné e-commerce marketplace : je veux Le Bon Coin, Back Market, pas des détaillants
  // ni du luxe ». 47.99A (vente à domicile) et 47.99B (automates, éventaires, marchés) sont du COMMERCE DE
  // DÉTAIL hors magasin, pas du e-commerce : ils rattachaient des détaillants classiques au secteur.
  describe('#4358 — e-commerce & marketplaces ne remonte que des acteurs du e-commerce', () => {
    const PURE_PLAYER = /^(47\.91[AB]|63\.12Z)$/

    it('ne porte que la vente à distance (47.91A/B) et les portails web (63.12Z)', () => {
      expect(APPLICATION_SECTOR_NAF.ecommerce.filter(code => !PURE_PLAYER.test(code))).toEqual([])
      expect(APPLICATION_SECTOR_NAF.ecommerce).toEqual(expect.arrayContaining(['47.91A', '47.91B', '63.12Z']))
    })

    it('ne partage AUCUN code avec les détaillants ni le luxe', () => {
      const neighbours = new Set([...APPLICATION_SECTOR_NAF.retail, ...APPLICATION_SECTOR_NAF.luxury])
      expect(APPLICATION_SECTOR_NAF.ecommerce.filter(code => neighbours.has(code))).toEqual([])
    })

    it('famille — un secteur du groupe commerce ne reprend aucun code du commerce de détail hors magasin', () => {
      for (const sector of sectorCodesForGroup('commerce')) {
        const horsMagasin = (APPLICATION_SECTOR_NAF[sector] ?? []).filter(code => code.startsWith('47.99'))
        expect(horsMagasin, sector).toEqual([])
      }
    })
  })
})
