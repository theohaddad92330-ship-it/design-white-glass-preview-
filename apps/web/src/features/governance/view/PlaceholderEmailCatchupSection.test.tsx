import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #4599.4 — le geste d'ADMIN D'ESPACE sur `/contacts/imports` : compter d'abord (simulation, rien n'est écrit),
 * puis vider explicitement, borné à 100. Ce que l'écran doit savoir dire NON : un membre simple ne voit pas le geste ;
 * l'exécution n'est jamais proposée avant la simulation, ni quand elle a compté 0.
 */
const role = vi.fn()
const mutate = vi.fn()
const catchup = vi.fn()
vi.mock('@/features/team/hooks/useTeam', () => ({ useTeam: () => ({ team: { workspace: { role: role() } } }) }))
vi.mock('../api', () => ({ usePlaceholderEmailCatchup: () => catchup() }))

const { PlaceholderEmailCatchupSection } = await import('./PlaceholderEmailCatchupSection')

beforeEach(() => {
  role.mockReset()
  mutate.mockReset()
  catchup.mockReset()
  catchup.mockReturnValue({ mutate, data: undefined, isPending: false, isError: false, reset: vi.fn() })
})

describe('PlaceholderEmailCatchupSection', () => {
  it('REFUS — un membre simple (ou un rôle inconnu) ne voit pas le geste', () => {
    role.mockReturnValue('member')
    expect(render(<PlaceholderEmailCatchupSection />).container).toBeEmptyDOMElement()
    role.mockReturnValue('sales_ops')
    expect(render(<PlaceholderEmailCatchupSection />).container).toBeEmptyDOMElement()
    role.mockReturnValue(undefined)
    expect(render(<PlaceholderEmailCatchupSection />).container).toBeEmptyDOMElement()
  })

  it("l'admin SIMULE d'abord : le seul geste offert est « Compter », sans écriture", () => {
    role.mockReturnValue('admin')
    render(<PlaceholderEmailCatchupSection />)
    expect(screen.queryByRole('button', { name: /Vider/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Compter les adresses gabarit' }))
    expect(mutate).toHaveBeenCalledWith({ dryRun: true })
  })

  it('après la simulation, le chiffre est lu et l’exécution bornée est proposée', () => {
    role.mockReturnValue('owner')
    catchup.mockReturnValue({
      mutate,
      data: { dry_run: true, examined: 40, cleared: 10, skipped: 1, limit: 100, limit_reached: false },
      isPending: false,
      isError: false,
      reset: vi.fn(),
    })
    render(<PlaceholderEmailCatchupSection />)
    expect(
      screen.getByText('10 adresses gabarit à vider (1 gardée à la main, laissée telle quelle)'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Vider 10 adresses' }))
    expect(mutate).toHaveBeenCalledWith({ dryRun: false })
  })

  it('une simulation à 0 ne propose aucune exécution', () => {
    role.mockReturnValue('owner')
    catchup.mockReturnValue({
      mutate,
      data: { dry_run: true, examined: 40, cleared: 0, skipped: 0, limit: 100, limit_reached: false },
      isPending: false,
      isError: false,
      reset: vi.fn(),
    })
    render(<PlaceholderEmailCatchupSection />)
    expect(screen.getByText('Aucune adresse gabarit dans cet espace.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Vider/ })).toBeNull()
  })

  it('au-delà de 100, le bouton annonce la borne', () => {
    role.mockReturnValue('owner')
    catchup.mockReturnValue({
      mutate,
      data: { dry_run: true, examined: 900, cleared: 240, skipped: 0, limit: 100, limit_reached: false },
      isPending: false,
      isError: false,
      reset: vi.fn(),
    })
    render(<PlaceholderEmailCatchupSection />)
    expect(screen.getByRole('button', { name: 'Vider 100 adresses sur 240' })).toBeInTheDocument()
  })

  it("après l'exécution, le résultat est dit, et s'il en reste, le geste suivant aussi", () => {
    role.mockReturnValue('owner')
    catchup.mockReturnValue({
      mutate,
      data: { dry_run: false, examined: 300, cleared: 100, skipped: 0, limit: 100, limit_reached: true },
      isPending: false,
      isError: false,
      reset: vi.fn(),
    })
    render(<PlaceholderEmailCatchupSection />)
    expect(
      screen.getByText(/100 adresses vidées, l’ancienne valeur est au journal de chaque fiche/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Il en reste : comptez à nouveau/)).toBeInTheDocument()
  })

  it("un échec de l'API est dit, jamais un chiffre inventé", () => {
    role.mockReturnValue('owner')
    catchup.mockReturnValue({ mutate, data: undefined, isPending: false, isError: true, reset: vi.fn() })
    render(<PlaceholderEmailCatchupSection />)
    expect(screen.getByText('Le comptage n’a pas abouti. Réessaie.')).toBeInTheDocument()
  })
})
