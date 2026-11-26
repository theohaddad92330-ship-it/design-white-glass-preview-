import { describe, expect, it } from 'vitest'
import { trialLockEnumeration, trialLockMessage } from './trial-lock.js'

// #4629.2 — le message ÉNUMÈRE ce qui est fermé ET ce qui reste ouvert, sans aucun chiffre de crédits.
describe('#4629.2 — le verrou d’essai s’énumère', () => {
  it('nomme le chat et Découvrir parmi les fermés, et ce qui reste ouvert', () => {
    const fr = trialLockEnumeration('fr')
    expect(fr).toContain('le chat avec Laura')
    expect(fr).toContain('Découvrir')
    expect(fr).toContain('les analyses')
    expect(fr).toMatch(/Restent ouverts : .*consultation.*facturation/)
    expect(trialLockEnumeration('en')).toMatch(/Closed: .*the chat with Laura.*Still open:/)
  })

  it('dit NON à un « tout est verrouillé » : une partie reste ouverte, nommée', () => {
    expect(trialLockMessage('fr')).not.toMatch(/tout est verrouillé/i)
    expect(trialLockMessage('fr')).toMatch(/Restent ouverts/)
  })

  it('ne porte AUCUN chiffre (crédits implicites)', () => {
    expect(trialLockMessage('fr')).not.toMatch(/\d/)
    expect(trialLockMessage('en')).not.toMatch(/\d/)
    expect(trialLockMessage('fr')).not.toMatch(/cr[ée]dits?/i)
  })
})
