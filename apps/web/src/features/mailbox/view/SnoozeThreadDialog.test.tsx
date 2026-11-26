import type { MailThread } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Théo B m1 — « Reprendre cet échange plus tard ». Reporter ne contacte personne : le fil revient dans « À traiter »
 * à la date choisie, et rien n'est envoyé.
 */
const snoozeMutate = vi.fn()
vi.mock('../api', () => ({ useSnoozeThread: () => ({ mutate: snoozeMutate, isPending: false, isError: false }) }))

const { SnoozeThreadDialog } = await import('./SnoozeThreadDialog')

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

beforeEach(() => snoozeMutate.mockReset())

describe('SnoozeThreadDialog', () => {
  it('dit que rien ne part et que l’échange est retrouvable dans À venir', () => {
    render(<SnoozeThreadDialog thread={thread} open onOpenChange={() => {}} timeZone="Europe/Paris" />)
    expect(screen.getByText(/Retrouvable dans À venir/)).toBeInTheDocument()
    expect(screen.getByText(/Aucun e-mail ni rappel externe envoyé/)).toBeInTheDocument()
  })

  it('« Reporter » envoie la date choisie en ISO pour ce fil', () => {
    render(<SnoozeThreadDialog thread={thread} open onOpenChange={() => {}} timeZone="Europe/Paris" />)
    fireEvent.change(screen.getByLabelText('À partir du'), { target: { value: '2026-10-27T09:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reporter' }))
    expect(snoozeMutate).toHaveBeenCalledTimes(1)
    expect(snoozeMutate.mock.calls[0]?.[0]).toEqual({ threadId: 't1', until: '2026-10-27T08:00:00.000Z' })
  })

  it('une date effacée désactive « Reporter » : jamais une date devinée', () => {
    render(<SnoozeThreadDialog thread={thread} open onOpenChange={() => {}} timeZone="Europe/Paris" />)
    fireEvent.change(screen.getByLabelText('À partir du'), { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Reporter' })).toBeDisabled()
  })
})
