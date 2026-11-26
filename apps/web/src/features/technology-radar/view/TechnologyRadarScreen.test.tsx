import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { TechnologyRadarScreen } from './TechnologyRadarScreen'

vi.mock('@/features/technology-radar/api/technology-radar-api', () => ({ fetchTechnologyRadar: vi.fn() }))

function renderScreen(technology: string, onTechnologyChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TechnologyRadarScreen technology={technology} onTechnologyChange={onTechnologyChange} />
    </QueryClientProvider>,
  )
  return onTechnologyChange
}

describe('#4282.10 — l’entrée par technologie : liste fermée d’abord, saisie libre en repli', () => {
  it('une technologie de la liste fermée se choisit d’un geste', () => {
    const onChange = renderScreen('')
    fireEvent.click(screen.getByRole('button', { name: 'SAP' }))
    expect(onChange).toHaveBeenCalledWith('SAP')
    expect(screen.getByRole('heading', { level: 3, name: 'Aucun radar ouvert' })).toBeTruthy()
  })

  it('la saisie libre part telle quelle ; NON : une saisie vide ne lance rien', () => {
    const onChange = renderScreen('')
    fireEvent.click(screen.getByRole('button', { name: 'Voir le radar' }))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Technologie'), { target: { value: 'Mainframe COBOL' } })
    fireEvent.click(screen.getByRole('button', { name: 'Voir le radar' }))
    expect(onChange).toHaveBeenCalledWith('Mainframe COBOL')
  })

  it('refonte Théo : la carte de recherche porte la question en h2, l’écran ne repose AUCUN h1 (la coque le porte)', () => {
    renderScreen('')
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    const headings = screen.getAllByRole('heading').map(h => `${h.tagName}:${h.textContent}`)
    expect(headings).toEqual(['H2:Quelle technologie veux-tu explorer ?', 'H3:Aucun radar ouvert'])
    // NON : la saisie libre et la liste fermée vivent dans la MÊME carte.
    const card = screen.getByRole('region', { name: 'Quelle technologie veux-tu explorer ?' })
    expect(card.querySelector('input')).not.toBeNull()
    expect(card.textContent).toContain('SAP')
  })
})
