import { describe, expect, it } from 'vitest'
import { completePlace, isOtherActor, otherActorRows, otherKindsForEntityType } from './discover-other-actors'
import type { DiscoverCandidate } from './discover-types'

const base = { siren: '111111118', name: 'X', city: 'Lille' } as DiscoverCandidate

describe('#4746.2 — Comptes ne garde que des clients finaux', () => {
  it('EXTIA (ESN) et FRANCE TRAVAIL (site d’annonces) sont « autres acteurs »', () => {
    expect(isOtherActor({ actorKind: 'esn' })).toBe(true)
    expect(isOtherActor({ actorKind: 'adsite' })).toBe(true)
  })
  it('les drapeaux d’avant le déploiement restent lus ; un client final ou une nature non prouvée restent dans Comptes', () => {
    expect(isOtherActor({ isEsnPeer: true })).toBe(true)
    expect(isOtherActor({ isIntermediary: true })).toBe(true)
    expect(isOtherActor({ isDeclaredPartner: true })).toBe(true)
    expect(isOtherActor({})).toBe(false)
  })
  it('l’ancien filtre entityType=esn ouvre les pastilles ESN et partenaires, jamais « tous »', () => {
    expect(otherKindsForEntityType('esn')).toEqual(['esn', 'partner'])
    expect(otherKindsForEntityType('client')).toBeNull()
    expect(otherKindsForEntityType('all')).toBeNull()
  })
  it('une ligne sans offre mesurée garde un nombre vide, jamais 0', () => {
    const rows = otherActorRows([
      { ...base, actorKind: 'esn' },
      { ...base, siren: '222222226', name: 'Y' },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.offerCount).toBeNull()
  })
})

describe('#4419.5 / #4814 — lieu coupé', () => {
  it('« Lille, Hauts-de- » redevient « Lille, Hauts-de-France »', () => {
    expect(completePlace('Lille, Hauts-de-')).toBe('Lille, Hauts-de-France')
  })
  it('un lieu entier ou inconnu ne bouge pas, rien n’est deviné', () => {
    expect(completePlace('Lille, Hauts-de-France')).toBe('Lille, Hauts-de-France')
    expect(completePlace('Aix-')).toBe('Aix-')
    expect(completePlace('  ')).toBeNull()
    expect(completePlace(undefined)).toBeNull()
  })
})
