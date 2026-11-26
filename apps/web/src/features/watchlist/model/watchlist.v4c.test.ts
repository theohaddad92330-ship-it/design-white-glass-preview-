import { describe, expect, it } from 'vitest'
import { signalDiscardReason } from './watchlist'

// V4-CORRECTIFS-C 4283.1 (#4088.7) — « presse seule » : un signal TYPÉ presse/actualité, sans déclencheur
// commercial, est écarté (« Écartés (N) »). Avant, seul le mot « presse » dans le texte ou un résultat financier
// l'écartait : un article ordinaire de presse restait une ligne de la vue par défaut.
describe('signalDiscardReason — presse seule', () => {
  it('un article de presse sans déclencheur est écarté', () => {
    expect(signalDiscardReason({ signalType: 'press', signalLabel: 'Visite du ministre sur le site' }, undefined)).toBe(
      'general',
    )
    expect(
      signalDiscardReason({ signalType: 'Actualité', signalLabel: 'Une nouvelle campagne de marque' }, undefined),
    ).toBe('general')
  })

  it('sait dire NON : la presse qui porte un rachat ou une levée reste, et un recrutement aussi', () => {
    expect(
      signalDiscardReason({ signalType: 'press', signalLabel: 'Rachat de la société Alpha annoncé' }, undefined),
    ).toBeNull()
    expect(signalDiscardReason({ signalType: 'Recrutement', signalLabel: 'Développeur Java' }, undefined)).toBeNull()
    expect(signalDiscardReason({ signalType: 'Nomination', signalLabel: 'Nouveau DSI' }, undefined)).toBeNull()
  })
})
