import { describe, expect, it } from 'vitest'
import { APPLICATION_SECTOR_NAF, type IdealAccountProfile } from '@bellum/contracts'
import { buildDiscoverRequest, emptyUnifiedFilters } from './discover-filters'
import { searchFromFilters } from './discover-prefill'
import { headcountForProfileSize, proposeProfileSize } from './discover-profile-size'
import { DEFAULT_SIGNAL_SOURCES } from './discover-types'

function icp(size: IdealAccountProfile['size']): IdealAccountProfile {
  return { size, sectorsPriority: [], decisionLevel: 'director', entryStrategy: 'topDown' }
}

function registryFilters(request: ReturnType<typeof buildDiscoverRequest>) {
  if (request?.mode !== 'registry') throw new Error('recherche registre attendue')
  return request.query.filters
}

const nuclear = { ...emptyUnifiedFilters(), sectors: ['nuclear'] }

describe('#4516.6 / #4516.7 — la taille du profil est PROPOSÉE, jamais appliquée (revient sur T.1)', () => {
  it('propose la taille du profil sur une recherche qui n’en porte aucune, sans toucher la requête', () => {
    expect(proposeProfileSize(nuclear, icp('eti'), false)).toBe('eti')
    const request = buildDiscoverRequest(nuclear)
    expect(registryFilters(request)).not.toHaveProperty('headcountMin')
    expect(registryFilters(request)).not.toHaveProperty('headcountRanges')
  })

  it('le geste « Filtrer sur ETI » pose la tranche de la taille', () => {
    expect(headcountForProfileSize('eti')).toEqual(['250-999'])
    expect(headcountForProfileSize('all')).toEqual([])
  })

  it('un filtre explicite de l’utilisateur gagne toujours (tranche ou catégorie) : rien à proposer', () => {
    expect(proposeProfileSize({ ...nuclear, headcount: ['10-49' as const] }, icp('eti'), false)).toBeNull()
    expect(proposeProfileSize({ ...nuclear, companyCategory: ['GE'] }, icp('eti'), false)).toBeNull()
  })

  it('écartée (`profileSize=off`) : elle n’est plus proposée', () => {
    expect(proposeProfileSize(nuclear, icp('eti'), true)).toBeNull()
  })

  it('« toutes tailles », l’absence de profil, un rail vide, une recherche par signaux : rien', () => {
    expect(proposeProfileSize(nuclear, icp('all'), false)).toBeNull()
    expect(proposeProfileSize(nuclear, null, false)).toBeNull()
    expect(proposeProfileSize(nuclear, undefined, false)).toBeNull()
    expect(proposeProfileSize(emptyUnifiedFilters(), icp('eti'), false)).toBeNull()
    const signals = { ...nuclear, signalSources: [DEFAULT_SIGNAL_SOURCES[0]] }
    expect(proposeProfileSize(signals, icp('eti'), false)).toBeNull()
  })
})

// G-FIX FUITE DE FILTRES — recette PROD 20/10 : « SAP » sans filtre faisait gagner à l'URL
// `headcount=250-999` et `region=11,44`, sans geste. Un défaut du profil ne se pose jamais sur une
// recherche par compétence seule.
describe('G-FIX — le profil ne fuit pas dans une recherche par compétence seule', () => {
  const sap = { ...emptyUnifiedFilters(), freetext: 'SAP' }
  const zone = ['11', '44']

  it('la taille du profil n’est même pas proposée sur « SAP » seul', () => {
    expect(proposeProfileSize(sap, icp('eti'), false)).toBeNull()
    const keywords = { ...emptyUnifiedFilters(), keywords: 'SAP' }
    expect(proposeProfileSize(keywords, icp('eti'), false)).toBeNull()
  })
})

/**
 * #4516.4 — la démonstration PROPOSE la taille du profil (« grandCompte », `DEMO_PROFILE_CONTEXT`) sur la première
 * recherche enregistrée qu'elle ouvre. L'ordre de la liste est celui de l'API (partagées d'abord, puis par nom) : « Rang
 * 2 cyber » arrive en tête. Ses critères sont ceux de `DEMO_DISCOVER_SAVED_VIEWS` — un mot-clé seul n'appelle pas de
 * taille (`structuredCriteria`), le recours externe observé, lui, est un critère structuré.
 */
describe('#4516.4 — la première recherche semée en démonstration propose la taille du profil', () => {
  const rang2Cyber = { ...emptyUnifiedFilters(), keywords: 'cybersécurité', externalRecourseObserved: true }

  it('« Rang 2 cyber » (mot-clé + recours externe observé) propose « grand compte »', () => {
    expect(proposeProfileSize(rang2Cyber, icp('grandCompte'), false)).toBe('grandCompte')
  })

  it('sait dire NON : le mot-clé seul ne propose rien, un profil « toutes tailles » non plus', () => {
    expect(
      proposeProfileSize({ ...emptyUnifiedFilters(), keywords: 'cybersécurité' }, icp('grandCompte'), false),
    ).toBeNull()
    expect(proposeProfileSize(rang2Cyber, icp('all'), false)).toBeNull()
  })
})
