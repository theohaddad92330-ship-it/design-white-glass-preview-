import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./ImportPortfolioDialog', () => ({
  ImportPortfolioDialog: ({ onClose }: { onClose: () => void }) => (
    <button type="button" onClick={onClose}>
      modale ouverte
    </button>
  ),
}))

const { ImportPortfolioButton } = await import('./ImportPortfolioButton')

// Théo A comptes-import.R1 — l'APPELANT : la porte « Importer » est atteignable depuis Comptes.
describe('ImportPortfolioButton', () => {
  it('ouvre puis ferme la modale d’import', () => {
    render(<ImportPortfolioButton />)

    expect(screen.queryByText('modale ouverte')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }))
    fireEvent.click(screen.getByText('modale ouverte'))
    expect(screen.queryByText('modale ouverte')).toBeNull()
  })
})
