import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutreachMessage } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { useOutreachMessages } from '@/features/outreach/hooks/useOutreachMessages'
import { ContactOutreachMessagesCard } from './ContactOutreachMessagesCard'
import { useContactEngagement } from '@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext'
import type { Contact } from '@bellum/contracts'
import userEvent from '@testing-library/user-event'

vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext', () => ({
  useContactEngagement: vi.fn(),
  useOptionalContactEngagement: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const openEngagement = vi.fn()
const contact = {
  id: 'contact-1',
  full_name: 'Claire Dubois',
  email: 'claire@example.com',
  account_id: 'acc-1',
} as Contact

vi.mock('@/features/outreach/hooks/useOutreachMessages', () => ({
  useOutreachMessages: vi.fn(),
}))

function setMessages(messages: OutreachMessage[]) {
  vi.mocked(useOutreachMessages).mockReturnValue({
    data: messages,
    isLoading: false,
  } as unknown as ReturnType<typeof useOutreachMessages>)
}

function message(overrides: Partial<OutreachMessage> = {}): OutreachMessage {
  return {
    id: 'msg-1',
    contact_id: 'contact-1',
    contact_name: 'Claire Dubois',
    contact_role: null,
    account_name: null,
    channel: 'email',
    intent: 'open_relationship',
    source: 'laura',
    reason: null,
    status: 'needs_review',
    sequence_id: null,
    sequence_step_id: null,
    asset_id: null,
    owner_id: 'user-1',
    current_version: 1,
    message_style_template_id: null,
    message_style_template_version: null,
    subject: 'Suite à notre échange',
    body: 'Bonjour Claire, suite à…',
    versions: [],
    approval: null,
    view: null,
    blockers: [],
    risks: [],
    can_approve: true,
    required_permission: 'messages:send',
    created_at: '2026-09-20T09:00:00.000Z',
    updated_at: '2026-09-20T09:00:00.000Z',
    ...overrides,
  }
}

describe('ContactOutreachMessagesCard — #2366.1, la fiche Contact relit le message canonique', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    openEngagement.mockClear()
    vi.mocked(useContactEngagement).mockReturnValue({ openEngagement } as unknown as ReturnType<
      typeof useContactEngagement
    >)
  })

  it('#3689.1 — sans message, AUCUNE carte (ni titre, ni « aucun message ») : une absence ne fait pas de ligne', () => {
    setMessages([])
    const { container } = render(<ContactOutreachMessagesCard contact={contact} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('#3689.2 — un brouillon se REPREND dans l’éditeur commun, avec version et destinataire lisibles', async () => {
    setMessages([message({ status: 'drafted', current_version: 3 })])
    render(<ContactOutreachMessagesCard contact={contact} />)
    expect(screen.getByText(/À : Claire Dubois · Version 3/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reprendre le brouillon' }))
    expect(openEngagement).toHaveBeenCalledWith([contact], 'email')
  })

  it('#3689.3 — un message déjà envoyé ne propose pas de reprise ; la file d’approbation reste atteignable', () => {
    setMessages([message({ status: 'sent' })])
    render(<ContactOutreachMessagesCard contact={contact} />)
    expect(screen.queryByRole('button', { name: 'Reprendre le brouillon' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ouvrir la file d’approbation' })).toHaveAttribute(
      'href',
      '/actions/sequences',
    )
  })

  it('#3689.4 — la validation se lit : qui a validé quelle version', () => {
    setMessages([
      message({
        status: 'approved',
        approval: {
          author: 'user-1',
          date: '2026-09-21T09:00:00.000Z',
          version: 2,
          audience: { kind: 'contact', contact_ids: ['contact-1'], size: 1 },
          policy: 'p',
          cost: null,
          conditions: [],
        },
      }),
    ])
    render(<ContactOutreachMessagesCard contact={contact} />)
    expect(screen.getByText(/Validé : version 2/)).toBeInTheDocument()
  })

  it('#3689.5 — sans coordonnée pour le canal du brouillon, la préparation reste possible sur un autre canal', async () => {
    setMessages([message({ status: 'drafted', channel: 'phone' })])
    render(<ContactOutreachMessagesCard contact={contact} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reprendre le brouillon' }))
    expect(openEngagement).toHaveBeenCalledWith([contact], 'email')
  })

  it('montre l’objet, son état et son corps — le MÊME que le centre d’approbation lit', () => {
    setMessages([message()])
    render(<ContactOutreachMessagesCard contact={contact} />)
    expect(screen.getByText('Suite à notre échange')).toBeInTheDocument()
    expect(screen.getByText('Bonjour Claire, suite à…')).toBeInTheDocument()
    expect(screen.getByText('À relire')).toBeInTheDocument()
  })

  it('un message sans objet (canal appel, par ex.) ne montre aucune ligne « objet » vide', () => {
    setMessages([message({ subject: null })])
    render(<ContactOutreachMessagesCard contact={contact} />)
    expect(screen.queryByText('null')).not.toBeInTheDocument()
    expect(screen.getByText('Bonjour Claire, suite à…')).toBeInTheDocument()
  })

  /**
   * #3419/#3420 (30/09/2026, lot C16) — les retours bêta ont été déposés
   * DEPUIS cette carte : elle relit le même objet que le centre d'approbation
   * (#2366.1), donc les mêmes bloquants doivent s'y voir, pas seulement
   * là-bas.
   */
  it('nomme ce qui bloque la validation — le même bloquant que le centre d’approbation (#3419/#3420)', () => {
    setMessages([message({ blockers: ['unverified_relationship_claim', 'generic_message'], view: 'blocked' })])
    render(<ContactOutreachMessagesCard contact={contact} />)
    expect(screen.getByText('Le message suppose une relation non vérifiée')).toBeInTheDocument()
    expect(screen.getByText('Ce message conviendrait à n’importe quelle autre entreprise')).toBeInTheDocument()
  })

  it('un message sans bloquant ne montre aucune ligne de bloquant', () => {
    setMessages([message({ blockers: [] })])
    render(<ContactOutreachMessagesCard contact={contact} />)
    expect(screen.queryByText('Il manque une preuve')).not.toBeInTheDocument()
  })
})
