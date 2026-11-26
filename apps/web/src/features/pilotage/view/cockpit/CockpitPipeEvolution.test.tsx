import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** « Évolution du pipe » (Théo, rangée sous le cap) : deux points réels, jamais une courbe inventée. */

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
const waterfall = vi.fn()
vi.mock('../../pipe/api', () => ({ usePipeWaterfall: () => waterfall() }))

const { CockpitPipeEvolution } = await import('./CockpitPipeEvolution')

const data = {
  from: '2026-09-23',
  to: '2026-10-23',
  openingCents: 30_000_000,
  createdCents: 13_300_000,
  raisedCents: 0,
  loweredCents: 0,
  lostCents: 4_000_000,
  signedCents: 7_100_000,
  removedCents: 0,
  closingCents: 41_700_000,
  unexplainedCents: 9_500_000,
  openingCount: 5,
  closingCount: 7,
  withoutAmountCount: 1,
}

beforeEach(() => vi.clearAllMocks())

describe('Évolution du pipe', () => {
  it('montre le pipe au début de la période et aujourd’hui, puis ce qui l’a fait bouger', () => {
    waterfall.mockReturnValue({ data, isLoading: false, isError: false })
    render(<CockpitPipeEvolution />)
    const card = screen.getByTestId('cockpit-evolution')
    expect(screen.getByRole('heading', { name: 'Évolution du pipe' })).toBeInTheDocument()
    expect(card).toHaveTextContent('300 k€')
    expect(card).toHaveTextContent('417 k€')
    expect(card).toHaveTextContent('133 k€ créés · 71 k€ signés · 40 k€ perdus')
    expect(card).toHaveTextContent('1 affaire sans montant, hors des barres.')
    expect(card).toHaveTextContent('Les montants ne sont pas une prévision d’encaissement.')
    expect(screen.getByRole('link', { name: 'Voir le mouvement du pipe' })).toHaveAttribute('href', '/pilotage/pipe')
  })

  it('aucune affaire ouverte ni au début ni à la fin : aucune carte, jamais deux barres à zéro', () => {
    waterfall.mockReturnValue({
      data: { ...data, openingCount: 0, closingCount: 0, openingCents: 0, closingCents: 0 },
      isLoading: false,
      isError: false,
    })
    const { container } = render(<CockpitPipeEvolution />)
    expect(container).toBeEmptyDOMElement()
  })

  it('une lecture en échec ne se raconte pas comme un pipe vide', () => {
    waterfall.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    const { container } = render(<CockpitPipeEvolution />)
    expect(container).toBeEmptyDOMElement()
  })
})
