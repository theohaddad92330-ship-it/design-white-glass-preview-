import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SignalsHistory } from './SignalsHistory'

describe('lot 772 e) — le chargement de l’Historique', () => {
  it('rend un squelette de liste (lignes de compte), pas une carte centrée sur un écran vide', () => {
    render(<SignalsHistory items={[]} loading />)
    const loading = screen.getByTestId('history-loading')
    expect(within(loading).getAllByTestId('history-skeleton-row').length).toBeGreaterThanOrEqual(5)
    // Lisible aux lecteurs d’écran, sans carte d’état centrée.
    expect(within(loading).getByText('Chargement de l’historique…')).toBeInTheDocument()
    expect(loading).toHaveAttribute('aria-busy', 'true')
  })
})
