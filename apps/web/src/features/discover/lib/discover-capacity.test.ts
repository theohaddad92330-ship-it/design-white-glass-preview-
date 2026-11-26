import { describe, expect, it } from 'vitest'
import {
  proposedAccountVolume,
  proposedVolumeForContext,
  PROPOSED_ACCOUNT_VOLUME_BY_BAND,
  volumeNoticeApplies,
} from './discover-capacity'
import { DISCOVER_PAGE_SIZE } from './discover-query'

// #2291.9 — DÉCISION Louis 19/09/2026 : « 1-3 personnes : 10 comptes ; 4-8 :
// 25 ; 9 et plus : 50 ». Taille non déclarée (ou non mappable) ⇒ le défaut
// actuel, inchangé.
describe('proposedAccountVolume', () => {
  it('rend 10 pour une ESN où le commercial est seul', () => {
    expect(proposedAccountVolume('Je suis seul (fondateur / indépendant)')).toEqual({
      count: 10,
      band: 'oneToThree',
    })
  })

  it('rend 10 pour 2-3 personnes (même palier que « seul »)', () => {
    expect(proposedAccountVolume('2-3 personnes')).toEqual({ count: 10, band: 'oneToThree' })
  })

  it('rend 25 pour 4-8 personnes — exemple exact de la décision Louis', () => {
    expect(proposedAccountVolume('4-8 personnes')).toEqual({ count: 25, band: 'fourToEight' })
  })

  // #4673.2 (Louis 31/10) — palier « 9 et plus » : 50 → 100.
  it('rend 100 pour 8-15 personnes (rejoint « 9 et plus », la borne haute de Louis pour 4-8 est 8)', () => {
    expect(proposedAccountVolume('8-15 personnes')).toEqual({ count: 100, band: 'nineOrMore' })
  })

  it('rend 100 pour 15+ personnes', () => {
    expect(proposedAccountVolume('15+ personnes')).toEqual({ count: 100, band: 'nineOrMore' })
  })

  it("ne devine PAS un effectif pour « pas d'équipe commerciale dédiée » — défaut actuel inchangé", () => {
    expect(proposedAccountVolume("Je n'ai pas d'équipe commerciale dédiée")).toEqual({
      count: DISCOVER_PAGE_SIZE,
      band: null,
    })
  })

  it('retombe sur le défaut quand la taille est non déclarée (null/undefined)', () => {
    expect(proposedAccountVolume(null)).toEqual({ count: DISCOVER_PAGE_SIZE, band: null })
    expect(proposedAccountVolume(undefined)).toEqual({ count: DISCOVER_PAGE_SIZE, band: null })
  })

  it('retombe sur le défaut pour une réponse inconnue du dépôt (jamais un crash, jamais une valeur devinée)', () => {
    expect(proposedAccountVolume('une réponse qui n’existe pas')).toEqual({ count: DISCOVER_PAGE_SIZE, band: null })
  })

  it('la grille porte exactement les trois paliers de la décision Louis', () => {
    expect(PROPOSED_ACCOUNT_VOLUME_BY_BAND).toEqual({ oneToThree: 10, fourToEight: 25, nineOrMore: 100 })
  })
})

// #3408 — recette prod 01/10 : « 25 comptes proposés » ET « 1 compte trouvé — recherche
// incomplète ». Le nombre de comptes a UNE source : ce que la recherche a trouvé.
describe('volumeNoticeApplies', () => {
  const volume = { count: 25, band: 'fourToEight' as const }
  it('sait dire NON : moins de comptes trouvés que le volume visé, la phrase du volume se tait', () => {
    expect(volumeNoticeApplies(volume, 1)).toBe(false)
    expect(volumeNoticeApplies(volume, 24)).toBe(false)
  })
  it('le volume est dit quand la recherche l’atteint, ou quand le total trouvé est inconnu', () => {
    expect(volumeNoticeApplies(volume, 25)).toBe(true)
    expect(volumeNoticeApplies(volume, 80)).toBe(true)
    expect(volumeNoticeApplies(volume, null)).toBe(true)
  })
})

// #3528.4 — recette prod 04/10 : « 25 comptes proposés » à côté de « 0 entreprise trouvée »
// après un filtre. Le bandeau compte ce qui est AFFICHÉ après filtres.
describe('volumeNoticeApplies — après filtres (#3528.4)', () => {
  const volume = { count: 25, band: 'fourToEight' as const }
  it('se masque quand la liste affichée est vide, même si la recherche en avait trouvé 25', () => {
    expect(volumeNoticeApplies(volume, 25, 0)).toBe(false)
  })
  it('se masque quand les filtres ont réduit la liste sous le volume visé', () => {
    expect(volumeNoticeApplies(volume, 25, 3)).toBe(false)
  })
  it('reste dit quand la liste affichée atteint le volume', () => {
    expect(volumeNoticeApplies(volume, 25, 25)).toBe(true)
    expect(volumeNoticeApplies(volume, null, 30)).toBe(true)
  })
})

// #4673.2 (Louis 31/10) — la taille d'équipe règle TOUJOURS le volume : revient sur #4304.1 (Neutre = volume fixe).
describe('proposedVolumeForContext', () => {
  it('Neutre : la taille d’équipe déclarée règle aussi le volume', () => {
    expect(proposedVolumeForContext(true, '15+ personnes')).toEqual({ count: 100, band: 'nineOrMore' })
  })

  it('Neutre sans équipe déclarée : le défaut, inchangé', () => {
    expect(proposedVolumeForContext(true, null)).toEqual({ count: DISCOVER_PAGE_SIZE, band: null })
  })

  it('hors Neutre : le volume adapté à la capacité, inchangé', () => {
    expect(proposedVolumeForContext(false, '4-8 personnes')).toEqual(proposedAccountVolume('4-8 personnes'))
  })
})
