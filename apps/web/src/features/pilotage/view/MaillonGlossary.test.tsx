import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MaillonGlossary } from './MaillonGlossary'

/**
 * #2206.51 — « maillon » est utilisé partout sur /pilotage sans qu'aucune
 * définition ne soit accessible : ni tooltip, ni glossaire. Même famille que
 * `CycleVocabulary` (#1323, `features/projects`) — un terme du produit, dit
 * UNE fois, à la demande, par un bouton NOMMÉ (GA-32) plutôt qu'une icône
 * muette, jamais un bandeau permanent qui répéterait `intro` (GA-26).
 */
describe('MaillonGlossary — la définition de « maillon », à la demande (#2206.51)', () => {
  it('porte un bouton nommé, tabulable, et pas une icône muette', () => {
    render(<MaillonGlossary />)
    const trigger = screen.getByRole('button', { name: /maillon/i })
    expect(trigger).not.toHaveAttribute('tabindex', '-1')
  })

  it('un clic révèle la définition', async () => {
    render(<MaillonGlossary />)
    await userEvent.click(screen.getByRole('button', { name: /maillon/i }))
    expect(screen.getByText(/chaîne commerciale/i)).toBeInTheDocument()
  })
})
