import { describe, expect, it } from 'vitest'
import { candidateSiteCities } from './discover-site-cities'

const sig = (siteCity?: string | null) => ({ type: 'hiring', label: 'x', siteCity }) as never

describe('candidateSiteCities (#3238)', () => {
  it('liste les villes de site distinctes, dans l’ordre des signaux', () => {
    expect(candidateSiteCities({ city: 'Lille', signals: [sig('Lyon'), sig('Marseille'), sig('lyon')] })).toEqual([
      'Lyon',
      'Marseille',
    ])
  })

  it('⚠️ SAIT DIRE NON — ni absence, ni ville du siège, ni chaîne vide', () => {
    expect(
      candidateSiteCities({ city: 'Lille', signals: [sig(undefined), sig(null), sig('  '), sig('LILLE')] }),
    ).toEqual([])
  })
})

// Lot DÉCOUVRIR-MOTEUR (27/10) — #4515 / #4419 : en recherche par compétence, le lieu filtre sur le LIEU DE TRAVAIL de
// l'offre. Mesure prod : « Boulogne-Billancourt 92 » s'affichait sous ?city=Lille sans dire que l'offre est à Lille.
describe('candidateSiteCities — la ville de l’offre qui a prouvé la compétence', () => {
  const evidence = (city: string | null) =>
    ({ skill: 'Vue', offerCount: 1, latestOffer: { title: 'Dev', city, date: null, url: null, source: null } }) as never

  it('nomme la ville de l’offre quand elle n’est pas celle du siège', () => {
    expect(
      candidateSiteCities({ city: 'BOULOGNE-BILLANCOURT', signals: [], skillEvidence: evidence('59 - LILLE') }),
    ).toEqual(['Lille'])
  })

  it('⚠️ SAIT DIRE NON — offre au siège, sans ville, ou déjà dite par un signal', () => {
    expect(candidateSiteCities({ city: 'Lille', signals: [], skillEvidence: evidence('59 - LILLE') })).toEqual([])
    expect(candidateSiteCities({ city: 'Paris', signals: [], skillEvidence: evidence(null) })).toEqual([])
    expect(candidateSiteCities({ city: 'Paris', signals: [sig('Lille')], skillEvidence: evidence('Lille') })).toEqual([
      'Lille',
    ])
  })
})

// Lot Q (#4419.5, recette prod 01/11 : 6/21 « Hauts-de- ») — la ligne « Sites : » complète une région coupée.
describe('candidateSiteCities — un lieu coupé par la source', () => {
  it('complète « Lille, Hauts-de- » en « Lille, Hauts-de-France »', () => {
    expect(candidateSiteCities({ city: 'Paris', signals: [sig('Lille, Hauts-de-')] })).toEqual([
      'Lille, Hauts-de-France',
    ])
  })

  it('⚠️ SAIT DIRE NON — un tiret final sans région connue n’est pas deviné', () => {
    expect(candidateSiteCities({ city: 'Paris', signals: [sig('Aix-')] })).toEqual(['Aix-'])
  })
})
