import type { MeetingRecap } from '@bellum/contracts'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2103.18 — `MeetingNotesCard` EST L'APPELANT RÉEL DU DÉPÔT DE BROUILLON.
 *
 * Avant ce point, le mail de suivi était affiché mais jamais déposé : le seul
 * chemin d'écriture réellement branché était « tâches + CRM ». Cette suite
 * prouve que `onDepositEmailDraft` n'est passé à la cascade QUE si une
 * messagerie connectée sait créer des brouillons, et qu'il appelle bien
 * `mailboxApi.createDraft` (via `useCreateDraft`) avec le VRAI corps — jamais
 * un chemin d'envoi.
 */

const cascade = vi.fn()
const createDraft = vi.fn()
let mailboxStatus: { connected: boolean; capabilities: { draft: boolean } } | undefined
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedCascadeProps: any

vi.mock('../api', () => ({
  useTranscriptionStatus: () => ({ data: { available: false } }),
  useTranscribe: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateNoteTasks: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useExtractMeetingDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  readFileAsBase64: async () => 'QUJD',
}))
vi.mock('@/features/meetings/api', () => ({
  useMeetingCascade: () => ({ mutateAsync: cascade, isPending: false }),
  useApproveInternal: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/mailbox/api', () => ({
  useMailboxStatus: () => ({ data: mailboxStatus }),
  useCreateDraft: () => ({ mutateAsync: createDraft }),
}))
vi.mock('@/features/meetings/view/MeetingCascade', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  MeetingCascade: (props: any) => {
    capturedCascadeProps = props
    return null
  },
}))
vi.mock('@/features/crm/hooks/useCrmPresence', () => ({ useCrmPresence: () => ({ data: undefined }) }))
vi.mock('@/features/crm/hooks/useCrmDealPipelines', () => ({
  useCrmDealPipelines: () => ({ data: undefined, isError: false }),
}))

const { MeetingNotesCard } = await import('./MeetingNotesCard')

function recap(): MeetingRecap {
  return {
    summary: '',
    decisions: [],
    nextSteps: [],
    openQuestions: [],
    signals: [],
    followUpEmail: 'Bonjour, suite à notre échange…',
    opportunity: null,
    need: null,
    clientIssue: null,
    mentionedContacts: [],
    crmStage: null,
    reminder: null,
    learnings: [],
    facts: [],
    requests: [],
    criteria: [],
    dates: [],
    clientCommitments: [],
    userCommitments: [],
    recapEvidence: null,
    followUpEvidence: { kind: 'notes-derived' },
    sources: [],
    estimatedCredits: 0,
    sourceEventId: null,
  }
}

async function structure() {
  fireEvent.change(screen.getByPlaceholderText('Tes notes brutes, telles que tu les as prises.'), {
    target: { value: 'Notes' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Structurer' }))
  await waitFor(() => expect(cascade).toHaveBeenCalledTimes(1))
}

beforeEach(() => {
  cascade.mockReset()
  createDraft.mockReset()
  capturedCascadeProps = undefined
  mailboxStatus = undefined
})

describe('MeetingNotesCard — #2103.18 : le dépôt suit la messagerie connectée', () => {
  it('sans messagerie connectée, aucune capacité de dépôt n’est passée', async () => {
    cascade.mockResolvedValue({ recap: recap(), cascade: { cards: [], summary: {} } })
    render(<MeetingNotesCard accountId="acc-1" />)
    await structure()
    expect(capturedCascadeProps.onDepositEmailDraft).toBeUndefined()
  })

  it('messagerie connectée SANS capacité de brouillon : toujours rien', async () => {
    mailboxStatus = { connected: true, capabilities: { draft: false } }
    cascade.mockResolvedValue({ recap: recap(), cascade: { cards: [], summary: {} } })
    render(<MeetingNotesCard accountId="acc-1" />)
    await structure()
    expect(capturedCascadeProps.onDepositEmailDraft).toBeUndefined()
  })

  it('messagerie connectée : le dépôt appelle mailboxApi.createDraft avec le VRAI corps', async () => {
    mailboxStatus = { connected: true, capabilities: { draft: true } }
    createDraft.mockResolvedValue({
      webUrl: 'https://mail.example/d/1',
      draftId: 'd1',
      provider: 'google',
      messageId: null,
      threadId: null,
    })
    cascade.mockResolvedValue({ recap: recap(), cascade: { cards: [], summary: {} } })
    render(<MeetingNotesCard accountId="acc-1" />)
    await structure()
    expect(capturedCascadeProps.onDepositEmailDraft).toBeInstanceOf(Function)

    const result = await capturedCascadeProps.onDepositEmailDraft({ to: 'client@acme.fr', body: 'Corps réel' })

    expect(createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'client@acme.fr', body: 'Corps réel', subject: 'Suite à notre échange' }),
    )
    expect(result).toEqual({ webUrl: 'https://mail.example/d/1' })
  })
})
