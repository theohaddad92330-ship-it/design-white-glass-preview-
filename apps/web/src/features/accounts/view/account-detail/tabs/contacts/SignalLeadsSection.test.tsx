import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { SignalLeadsSection } from './SignalLeadsSection'

describe('SignalLeadsSection (#4324.1b)', () => {
  it('nomme la personne citée, dit « pas encore de fiche », et ouvre la création préremplie au clic', async () => {
    renderWithRouter(
      <SignalLeadsSection accountId="a" leads={[{ name: 'Jean Dupont', title: 'DSI', entity: 'STEF Transport' }]} />,
    )
    expect(await screen.findByText(/Jean Dupont/)).toBeInTheDocument()
    expect(screen.getByText(/cité dans un signal, pas encore de fiche/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ajouter et enrichir/ }))
    expect(await screen.findByDisplayValue('Jean Dupont')).toBeInTheDocument()
    expect(screen.getByDisplayValue('DSI')).toBeInTheDocument()
  })

  it('aucune piste : rien n’est rendu', () => {
    const { container } = renderWithRouter(<SignalLeadsSection accountId="a" leads={[]} />)
    expect(container.querySelector('[data-testid="signal-leads"]')).toBeNull()
  })
})
