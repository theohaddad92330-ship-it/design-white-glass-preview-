import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Contact, OutreachMessage } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { useOutreachMessages } from '@/features/outreach/hooks/useOutreachMessages'
import { useContactEngagement } from '@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext'
import { ContactPendingDrafts } from './ContactPendingDrafts'

vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext', () => ({
  useContactEngagement: vi.fn(),
  useOptionalContactEngagement: vi.fn(),
}))
vi.mock('@/features/outreach/hooks/useOutreachMessages', () => ({ useOutreachMessages: vi.fn() }))

const openEngagement = vi.fn()
const contact = { id: 'contact-1', full_name: 'Paul Ferrer', email: 'paul@exemple.fr', account_id: 'acc-1' } as Contact

function setMessages(messages: Array<Partial<OutreachMessage>>) {
  vi.mocked(useOutreachMessages).mockReturnValue({
    data: messages,
    isLoading: false,
  } as unknown as ReturnType<typeof useOutreachMessages>)
}

// Théo B c5-fiche-contact.N2 — le brouillon non envoyé se lit DANS le fil d'historique.
describe('ContactPendingDrafts', () => {
  beforeEach(async () => {
    openEngagement.mockClear()
    vi.mocked(useContactEngagement).mockReturnValue({ openEngagement } as unknown as ReturnType<
      typeof useContactEngagement
    >)
    await i18n.changeLanguage('fr')
  })

  it('un brouillon à reprendre : « Brouillon, non envoyé » + « Reprendre le brouillon » ouvre l’éditeur commun', async () => {
    setMessages([
      {
        id: 'm1',
        channel: 'email',
        status: 'needs_review',
        subject: 'Suite à notre échange',
        updated_at: '2026-10-19T09:00:00Z',
      },
    ])
    render(<ContactPendingDrafts contact={contact} />)
    expect(screen.getByText(/Brouillon, non envoyé/)).toBeInTheDocument()
    expect(screen.getByText(/Suite à notre échange/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reprendre le brouillon' }))
    expect(openEngagement).toHaveBeenCalledWith([contact], 'email')
  })

  it('un message déjà parti n’est pas un brouillon : aucune ligne', () => {
    setMessages([{ id: 'm2', channel: 'email', status: 'sent', subject: 'Parti', updated_at: '2026-10-19T09:00:00Z' }])
    const { container } = render(<ContactPendingDrafts contact={contact} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('sans message : rien (une absence ne fait aucune ligne)', () => {
    setMessages([])
    const { container } = render(<ContactPendingDrafts contact={contact} />)
    expect(container).toBeEmptyDOMElement()
  })
})
