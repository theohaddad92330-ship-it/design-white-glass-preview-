import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** #4406.4 — Messagerie › Beeper : rien sans branchement, injoignable NOMMÉ, envoi sur le seul clic. */
const h = vi.hoisted(() => ({
  status: { state: 'disconnected' } as Record<string, unknown> | undefined,
  conversations: undefined as unknown,
  conversationsEnabled: [] as boolean[],
  messages: undefined as unknown,
  mutate: vi.fn(),
  openLaura: vi.fn(),
}))

vi.mock('../api', () => ({
  useBeeperStatus: () => ({ data: h.status }),
  useBeeperConversations: (enabled: boolean) => {
    h.conversationsEnabled.push(enabled)
    return { data: enabled ? h.conversations : undefined, isError: false }
  },
  useBeeperMessages: () => ({ data: h.messages }),
  useBeeperSend: () => ({ mutate: h.mutate, reset: vi.fn(), isPending: false, data: undefined, error: null }),
}))
vi.mock('@/features/laura/bubble/use-open-laura-in-place', () => ({ useOpenLauraInPlace: () => h.openLaura }))

const { BeeperConversations } = await import('./BeeperConversations')

const nadia = {
  chatId: 'c1',
  network: 'WhatsApp',
  title: 'Nadia Perrin',
  type: 'single',
  unreadCount: null,
  lastActivity: null,
  participants: [
    { id: 'me', fullName: 'Vous', phoneNumber: null, email: null, username: null, isSelf: true },
    {
      id: 'n',
      fullName: 'Nadia Perrin',
      phoneNumber: '+33 6 39 98 41 27',
      email: 'nadia.perrin@sncf-groupe.example',
      username: null,
      isSelf: false,
    },
  ],
  contact: { contactId: 'k1', fullName: 'Nadia Perrin', accountId: null, matchedOn: 'email' },
}

describe('Messagerie › conversations Beeper (#4406.4)', () => {
  beforeEach(() => {
    h.conversationsEnabled = []
    h.mutate.mockReset()
    h.openLaura.mockReset()
    h.messages = {
      state: 'connected',
      chatId: 'c1',
      messages: [
        {
          id: 'm2',
          senderName: 'Nadia Perrin',
          isSender: false,
          timestamp: null,
          text: 'Pouvez-vous me les envoyer vendredi ?',
        },
      ],
    }
  })

  it('sans branchement : aucune section, et la lecture n’est PAS activée (no-op strict)', () => {
    h.status = { configured: true, state: 'disconnected' }
    const { container } = render(<BeeperConversations />)
    expect(container).toBeEmptyDOMElement()
    expect(h.conversationsEnabled.every(e => e === false)).toBe(true)
  })

  it('injoignable : NOMMÉ avec sa raison, jamais une liste vide', () => {
    h.status = { configured: true, state: 'unreachable' }
    h.conversations = {
      state: 'unreachable',
      reason: 'Beeper Desktop ne répond pas (application fermée ou tunnel coupé).',
    }
    render(<BeeperConversations />)
    expect(screen.getByTestId('beeper-unreachable')).toHaveTextContent(/tunnel coupé/)
  })

  it('liste avec le réseau, les coordonnées en clair et le contact rattaché ; aucun « 0 non lu »', () => {
    h.status = { configured: true, state: 'connected' }
    h.conversations = { state: 'connected', conversations: [nadia] }
    render(<BeeperConversations />)
    expect(screen.getByText('WhatsApp')).toBeInTheDocument()
    expect(screen.getByText(/\+33 6 39 98 41 27 · nadia\.perrin@sncf-groupe\.example/)).toBeInTheDocument()
    expect(screen.getByTestId('beeper-contact-match')).toHaveTextContent('Nadia Perrin')
    expect(screen.queryByText(/0 non lu/)).toBeNull()
  })

  it('« Préparer la réponse » : Laura prépare, l’envoi ne part que sur le clic, avec une clé d’idempotence', async () => {
    h.status = { configured: true, state: 'connected' }
    h.conversations = { state: 'connected', conversations: [nadia] }
    render(<BeeperConversations />)
    await userEvent.click(screen.getByRole('button', { name: /Préparer la réponse/ }))
    expect(screen.getByTestId('beeper-recent-messages')).toHaveTextContent('vendredi')
    await userEvent.click(screen.getByRole('button', { name: /Préparer avec Laura/ }))
    expect(h.openLaura).toHaveBeenCalledWith(expect.stringContaining('Nadia Perrin'))
    expect(h.mutate).not.toHaveBeenCalled()
    const send = screen.getByRole('button', { name: /Envoyer sur Beeper/ })
    expect(send).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/Ta réponse/), 'Bien sûr, vendredi matin.')
    await userEvent.click(send)
    expect(h.mutate).toHaveBeenCalledTimes(1)
    const call = h.mutate.mock.calls[0]![0] as {
      chatId: string
      body: { text: string; idempotencyKey: string; replyToMessageId?: string }
    }
    expect(call.chatId).toBe('c1')
    expect(call.body.text).toBe('Bien sûr, vendredi matin.')
    expect(call.body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)
    expect(call.body.replyToMessageId).toBe('m2')
  })
})
