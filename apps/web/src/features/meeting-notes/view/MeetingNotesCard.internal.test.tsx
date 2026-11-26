import type { MeetingRecap } from '@bellum/contracts'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2103.31 — CAS LIMITE, RDV INTERNE : `MeetingNotesCard` REÇOIT le fait
 * (déjà calculé par `MeetingPrepDialog`/`MeetingLiveView` via
 * `deriveMeetingType`, `meeting-brief.ts`) et le RELAIE tel quel jusqu'à
 * `MeetingCascade`, jamais une seconde dérivation. Même patron que
 * `MeetingNotesCard.draft.test.tsx` (capture des props passées à la
 * cascade).
 */

const cascade = vi.fn()
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
  useMailboxStatus: () => ({ data: undefined }),
  useCreateDraft: () => ({ mutateAsync: vi.fn() }),
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
    followUpEmail: '',
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
    followUpEvidence: null,
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
  capturedCascadeProps = undefined
})

describe('MeetingNotesCard — #2103.31 : relaie isInternalMeeting jusqu’à la cascade', () => {
  it('rendez-vous interne (prop transmise) : la cascade le reçoit tel quel', async () => {
    cascade.mockResolvedValue({ recap: recap(), cascade: { cards: [], summary: {} } })
    render(<MeetingNotesCard accountId="acc-1" isInternalMeeting />)
    await structure()
    expect(capturedCascadeProps.isInternalMeeting).toBe(true)
  })

  it('sans le prop (défaut) : la cascade ne reçoit rien de forcé — comportement inchangé', async () => {
    cascade.mockResolvedValue({ recap: recap(), cascade: { cards: [], summary: {} } })
    render(<MeetingNotesCard accountId="acc-1" />)
    await structure()
    expect(capturedCascadeProps.isInternalMeeting).toBeFalsy()
  })
})
