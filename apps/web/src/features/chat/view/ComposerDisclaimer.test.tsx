import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ComposerDisclaimer } from './ComposerDisclaimer'

// #5042 (arbitrage Louis 31/10) — la barre « Laura garde en tête » disparaît ; la mention d'erreur reste,
// UNE fois, en petite ligne sous le composeur. Ni compteur de mémoire, ni bouton.
describe('ComposerDisclaimer — la petite ligne sous le composeur (#5042)', () => {
  it('dit une fois que les réponses peuvent contenir des erreurs', () => {
    render(<ComposerDisclaimer />)
    expect(screen.getAllByText(/Les réponses peuvent contenir des erreurs/)).toHaveLength(1)
  })

  it('sait dire NON : plus de barre mémoire — ni « Laura garde en tête », ni compteur, ni bouton', () => {
    render(<ComposerDisclaimer />)
    expect(screen.queryByText(/garde en tête|Mémoire/i)).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
