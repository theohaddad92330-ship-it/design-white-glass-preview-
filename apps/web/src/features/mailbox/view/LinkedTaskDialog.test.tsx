import type { MailThread } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Théo B m1 — « Créer une tâche liée » : une tâche rattachée au contact et au compte du fil, sans copier un seul mot du corps. */
const createMutate = vi.fn()
vi.mock('@/features/tasks/hooks/useTasks', () => ({
  useCreateTask: () => ({ mutate: createMutate, isPending: false }),
}))

const { LinkedTaskDialog } = await import('./LinkedTaskDialog')

const thread: MailThread = {
  threadId: 't1',
  subject: 'Suite à notre échange',
  counterpart: 'claire@helios.example',
  lastMessageAt: null,
  lastDirection: 'inbound',
  messageCount: 2,
  awaitingReply: false,
  daysSinceLastMessage: null,
  unread: false,
  hasAttachments: false,
  otherParticipants: [],
  contactId: '11111111-1111-4111-8111-111111111111',
  account: { id: '22222222-2222-4222-8222-222222222222', name: 'Hélios', via: 'contact' },
}

beforeEach(() => createMutate.mockReset())

describe('LinkedTaskDialog', () => {
  it('« Créer la tâche » reste désactivé tant que l’action et l’échéance manquent', () => {
    render(<LinkedTaskDialog thread={thread} open onOpenChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Créer la tâche' })).toBeDisabled()
  })

  it('crée une tâche liée au contact et au compte du fil', () => {
    render(<LinkedTaskDialog thread={thread} open onOpenChange={() => {}} />)
    fireEvent.change(screen.getByLabelText('Action à faire'), { target: { value: 'Envoyer le cadrage' } })
    fireEvent.change(screen.getByLabelText('Échéance'), { target: { value: '2026-10-28' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer la tâche' }))
    expect(createMutate).toHaveBeenCalledTimes(1)
    const input = createMutate.mock.calls[0]?.[0]
    expect(input).toMatchObject({
      title: 'Envoyer le cadrage',
      dueOn: '2026-10-28',
      contactId: thread.contactId,
      accountId: thread.account?.id,
    })
    expect(input.objective).toContain('Suite à notre échange')
    expect(input.expectedResult).toBeTruthy()
  })
})
