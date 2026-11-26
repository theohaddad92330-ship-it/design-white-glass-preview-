import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const profile = vi.fn()
vi.mock('@/features/profiles/hooks/useProfile', () => ({ useProfile: () => profile() }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to ?? '#'}>{children}</a>,
}))

const { TodayTeamReturn } = await import('./TodayTeamReturn')

describe('TodayTeamReturn — l’entrée de l’équipe depuis « Aujourd’hui » (a/today-equipe)', () => {
  beforeEach(async () => {
    profile.mockReset()
    await i18n.changeLanguage('fr')
  })

  it('rappelle que lire l’équipe ne change pas le rôle, et ramène à SA journée', () => {
    profile.mockReturnValue({ data: { first_name: 'Maëlle' } })
    render(<TodayTeamReturn />)
    expect(screen.getByText('Espace collectif · les filtres ne changent pas le rôle connecté.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Journée de Maëlle' })).toHaveAttribute('href', '/briefing')
  })

  it('sait dire NON : sans prénom connu, aucun nom inventé — le lien dit où il mène', () => {
    profile.mockReturnValue({ data: undefined })
    render(<TodayTeamReturn />)
    expect(screen.queryByText(/Journée de/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Revenir à Ma journée' })).toHaveAttribute('href', '/briefing')
  })

  it('n’offre aucune « journée d’un collègue » : le brief ne se lit que pour qui est connecté', () => {
    profile.mockReturnValue({ data: { first_name: 'Maëlle' } })
    render(<TodayTeamReturn />)
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })
})
