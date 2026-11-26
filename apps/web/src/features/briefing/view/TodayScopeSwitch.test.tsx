import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useTeam = vi.fn()
vi.mock('@/features/team/hooks/useTeam', () => ({ useTeam: () => useTeam() }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>
      {children}
    </a>
  ),
}))

const { TodayScopeSwitch } = await import('./TodayScopeSwitch')

describe('TodayScopeSwitch', () => {
  beforeEach(() => useTeam.mockReset())

  it('offre Moi / Équipe à qui peut gérer l’équipe, Moi étant la vue courante', () => {
    useTeam.mockReturnValue({ team: { workspace: { role: 'owner' } } })
    render(<TodayScopeSwitch />)
    expect(screen.getByRole('link', { name: 'Moi' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Équipe' })).toHaveAttribute('href', '/team')
  })

  it('ne montre pas un lien qui refuserait : rien pour un membre sans la permission', () => {
    useTeam.mockReturnValue({ team: { workspace: { role: 'member' } } })
    const { container } = render(<TodayScopeSwitch />)
    expect(container).toBeEmptyDOMElement()
  })
  it('Théo (`.v18-choice`) — le prénom de qui lit remplace « Moi », avec son initiale teintée', () => {
    useTeam.mockReturnValue({ team: { workspace: { role: 'owner' } } })
    render(<TodayScopeSwitch name="Maëlle" />)
    const me = screen.getByRole('link', { name: 'Maëlle' })
    expect(me).toHaveAttribute('aria-current', 'page')
    expect(me.querySelector('[aria-hidden="true"]')).toHaveTextContent('M')
  })
})
