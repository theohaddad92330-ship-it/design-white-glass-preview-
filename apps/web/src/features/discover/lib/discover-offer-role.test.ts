import { describe, expect, it } from 'vitest'
import { offerTargetBuyerRole } from './discover-offer-role'

describe('#2804 (#2291.2) — offre : rôles acheteurs, famille déclarée → clé du référentiel', () => {
  it('résout une famille déclarée en sa clé canonique', () => {
    expect(offerTargetBuyerRole(['cyber'])).toBe('cyber')
    expect(offerTargetBuyerRole(['RSSI'])).toBe('cyber')
  })

  it('tolère la casse / les espaces, comme le référentiel qu’elle consomme', () => {
    expect(offerTargetBuyerRole([' Cyber ', 'CYBER'])).toBe('cyber')
  })

  it('SAIT DIRE NON — une entrée non reconnue ne résout à aucune famille', () => {
    expect(offerTargetBuyerRole(['atlantide'])).toBeNull()
  })

  it('vide en entrée ⇒ `null`, jamais une famille devinée', () => {
    expect(offerTargetBuyerRole([])).toBeNull()
  })

  it('plusieurs familles DISTINCTES déclarées ⇒ `null` — aucun ordre de préférence à deviner', () => {
    expect(offerTargetBuyerRole(['cyber', 'it'])).toBeNull()
  })

  it('la même famille répétée (alias différents) reste résolue à une seule', () => {
    expect(offerTargetBuyerRole(['cyber', 'RSSI', 'CISO'])).toBe('cyber')
  })
})
