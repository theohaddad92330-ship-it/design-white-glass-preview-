import { render, screen } from '@testing-library/react'
import type { Contact } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { ContactMeetingPlanCard } from './ContactMeetingPlanCard'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    search,
    children,
    className,
  }: {
    to: string
    search: { plan: string }
    children: React.ReactNode
    className?: string
  }) => (
    <a href={`${to}?plan=${search.plan}`} className={className}>
      {children}
    </a>
  ),
}))

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

describe('ContactMeetingPlanCard (#3693.6)', () => {
  it('ouvre l’agenda réel avec le contact, sous le verbe « Planifier »', () => {
    render(<ContactMeetingPlanCard contact={{ id: 'c42', full_name: 'Amina Benali' } as unknown as Contact} />)
    const link = screen.getByRole('link', { name: 'Planifier un rendez-vous' })
    expect(link).toHaveAttribute('href', '/briefing?plan=c42')
    expect(screen.getByText(/l’invitation part quand tu valides/)).toBeInTheDocument()
  })

  // #4891 — dans une carte étroite le libellé passe à la ligne, il ne déborde pas du bouton.
  it('laisse le libellé du bouton passer à la ligne', () => {
    render(<ContactMeetingPlanCard contact={{ id: 'c42', full_name: 'Amina Benali' } as unknown as Contact} />)
    const cls = screen.getByRole('link', { name: 'Planifier un rendez-vous' }).className
    expect(cls).toContain('whitespace-normal')
    expect(cls).toContain('h-auto')
  })
})
