import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Contact } from '@bellum/contracts'

/**
 * #4546.5 — « à l'envoi, l'expéditeur se choisit parmi ses boîtes, et l'écran dit laquelle part ». Avec deux boîtes
 * capables d'envoyer, AUCUNE n'est choisie à la place de la personne : le bouton reste fermé tant qu'elle n'a pas
 * désigné, « De » dit l'adresse choisie, et l'envoi porte l'identifiant de CETTE boîte.
 */
const mutate = vi.fn()
const FIRST = '11111111-1111-4111-8111-111111111111'
const SECOND = '22222222-2222-4222-8222-222222222222'
const box = (connectionId: string, address: string | null, send = true) => ({
  connectionId,
  provider: 'google' as const,
  address,
  capabilities: { read: true, draft: true, send },
})
const state = vi.hoisted(() => ({ senders: [] as unknown[] }))

vi.mock('@/features/contacts/hooks/useSendContactEmail', () => ({
  useSendContactEmail: () => ({ mutate, isPending: false }),
}))
vi.mock('@/features/contacts/hooks/useContactSendability', () => ({
  useContactSendability: () => ({
    data: {
      sender: 'espace@exemple.test',
      reply_to: null,
      mailbox: { connected: true, address: 'nominative@esn.fr', can_send: true },
    },
  }),
}))
vi.mock('@/features/mailbox/api', () => ({ useMailboxSenders: () => ({ data: state.senders }) }))
vi.mock('@/features/contacts/hooks/useContactCadence', () => ({ useContactCadence: () => ({ data: undefined }) }))
vi.mock('@/features/contacts/hooks/useContactRanking', () => ({
  useContactRanking: () => ({ data: { excluded: [] }, isLoading: false }),
}))

const { EngagementSendEmailAction } = await import('./EngagementSendEmail')

const contact = {
  id: 'c1',
  full_name: 'Alice Martin',
  email: 'alice@exemple.test',
  email_sent_at: null,
} as unknown as Contact

const openDialog = () => {
  render(<EngagementSendEmailAction contact={contact} subject="Objet" text="Bonjour Alice" />)
  fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
}
const sendButton = () => screen.getByRole('button', { name: "Envoyer l'email" })

beforeEach(() => mutate.mockReset())

describe('EngagementSendEmailAction — #4546.5 l’expéditeur se choisit', () => {
  it('deux boîtes : rien n’est choisi d’office, l’envoi est fermé jusqu’au choix', () => {
    state.senders = [box(FIRST, 'nominative@esn.fr'), box(SECOND, 'prospection@marque.fr')]
    openDialog()
    expect(screen.getByLabelText("Boîte d'envoi")).toBeInTheDocument()
    expect(screen.getByText('À choisir ci-dessus')).toBeInTheDocument()
    expect(sendButton()).toBeDisabled()
    fireEvent.click(sendButton())
    expect(mutate).not.toHaveBeenCalled()
  })

  it('choisir la seconde : « De » dit son adresse, et l’envoi désigne CETTE boîte', async () => {
    state.senders = [box(FIRST, 'nominative@esn.fr'), box(SECOND, 'prospection@marque.fr')]
    openDialog()
    await userEvent.setup().click(screen.getByLabelText("Boîte d'envoi"))
    await userEvent.setup().click(await screen.findByRole('option', { name: 'prospection@marque.fr' }))
    expect(screen.getAllByText(/prospection@marque\.fr/).length).toBeGreaterThan(0)
    expect(sendButton()).toBeEnabled()
    fireEvent.click(sendButton())
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'mailbox', senderConnectionId: SECOND }),
      expect.anything(),
    )
  })

  it('une boîte sans la portée d’envoi n’est jamais proposée', () => {
    state.senders = [box(FIRST, 'lecture@esn.fr', false), box(SECOND, 'prospection@marque.fr')]
    openDialog()
    expect(screen.queryByLabelText("Boîte d'envoi")).not.toBeInTheDocument()
    expect(sendButton()).toBeEnabled()
    fireEvent.click(sendButton())
    expect(mutate.mock.calls[0]?.[0]).not.toHaveProperty('senderConnectionId')
  })

  it('SAIT DIRE NON — une seule boîte : aucun sélecteur, l’appel reste celui d’avant', () => {
    state.senders = [box(FIRST, 'nominative@esn.fr')]
    openDialog()
    expect(screen.queryByLabelText("Boîte d'envoi")).not.toBeInTheDocument()
    fireEvent.click(sendButton())
    expect(mutate.mock.calls[0]?.[0]).not.toHaveProperty('senderConnectionId')
  })
})
