import type { MailThread } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2104.6 — RATTACHER UN FIL À UN COMPTE À LA MAIN.
 *
 * Le bouton n'existe QUE parce que l'auto-détection (`thread-account-link.ts`)
 * a explicitement refusé de trancher (domaine ambigu, adresse inconnue) : ce
 * dialogue est le geste HUMAIN qui répare ce que l'automatique n'ose pas.
 */
const linkMutate = vi.fn()
let linkState: { mutate: typeof linkMutate; isPending: boolean; isError: boolean; reset: () => void }

vi.mock('../api', () => ({ useLinkThreadAccount: () => linkState }))
vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({
    data: {
      pages: [
        {
          data: [
            { id: 'acc-1', company_name: 'Verdal Distribution' },
            { id: 'acc-2', company_name: 'Pharmatek' },
          ],
        },
      ],
    },
  }),
}))

const { LinkAccountDialog } = await import('./LinkAccountDialog')

const thread: MailThread = {
  threadId: 't1',
  subject: 'Point projet',
  counterpart: 'client@acme.example',
  lastMessageAt: null,
  lastDirection: 'inbound',
  messageCount: 2,
  awaitingReply: false,
  daysSinceLastMessage: null,
  unread: false,
  hasAttachments: false,
  otherParticipants: [],
}

beforeEach(() => {
  linkMutate.mockReset()
  linkState = { mutate: linkMutate, isPending: false, isError: false, reset: vi.fn() }
})

describe('LinkAccountDialog — #2104.6', () => {
  it('liste les comptes du portefeuille', () => {
    render(<LinkAccountDialog thread={thread} open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByText('Verdal Distribution')).toBeInTheDocument()
    expect(screen.getByText('Pharmatek')).toBeInTheDocument()
  })

  it('le bouton de confirmation reste désactivé tant qu’aucun compte n’est choisi', () => {
    render(<LinkAccountDialog thread={thread} open onOpenChange={() => {}} />)
    expect(screen.getByRole('button', { name: /Rattacher/ })).toBeDisabled()
  })

  it('choisir un compte puis confirmer appelle le rattachement avec le bon fil', () => {
    render(<LinkAccountDialog thread={thread} open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByText('Verdal Distribution'))
    fireEvent.click(screen.getByRole('button', { name: /Rattacher/ }))
    expect(linkMutate).toHaveBeenCalledWith(
      { threadId: 't1', accountId: 'acc-1' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('rend `null` sans fil — pas de dialogue orphelin', () => {
    const { container } = render(<LinkAccountDialog thread={null} open onOpenChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
