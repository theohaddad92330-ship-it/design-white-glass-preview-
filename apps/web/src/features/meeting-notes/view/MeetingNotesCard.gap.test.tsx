import type { MeetingRecap } from '@bellum/contracts'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * #2103.32 — AUCUNE PROCHAINE ÉTAPE : LE GAP SE DIT, IL NE SE TAIT PAS.
 *
 * Un compte rendu qui a un résumé et des décisions mais AUCUNE prochaine
 * étape identifiée omettait la section en silence — la même lecture qu'un
 * compte rendu qui n'a simplement rien à en dire. La doctrine « non mesuré
 * n'est jamais 0 » vaut aussi dans l'autre sens : ici, on a bien REGARDÉ
 * (le reste du compte rendu le prouve) et rien n'a été trouvé — un vrai
 * constat, pas une absence de mesure. Il se nomme.
 */

const cascade = vi.fn()

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
vi.mock('@/features/meetings/view/MeetingCascade', () => ({ MeetingCascade: () => null }))
vi.mock('@/features/crm/hooks/useCrmPresence', () => ({ useCrmPresence: () => ({ data: undefined }) }))
vi.mock('@/features/crm/hooks/useCrmDealPipelines', () => ({
  useCrmDealPipelines: () => ({ data: undefined, isError: false }),
}))

const { MeetingNotesCard } = await import('./MeetingNotesCard')

function recapWithoutNextStep(): MeetingRecap {
  return {
    summary: 'Point exploratoire sur le besoin data.',
    decisions: ['On avance sur le poste data engineer'],
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
    recapEvidence: { kind: 'notes-derived' },
    followUpEvidence: null,
    sources: [],
    estimatedCredits: 0,
    sourceEventId: null,
  }
}

describe('MeetingNotesCard — #2103.32 : le gap se nomme', () => {
  it('dit explicitement qu’aucune prochaine étape n’a été identifiée', async () => {
    cascade.mockResolvedValue({ recap: recapWithoutNextStep(), cascade: { cards: [], summary: {} } })
    render(<MeetingNotesCard accountId="acc-1" />)
    fireEvent.change(screen.getByPlaceholderText('Tes notes brutes, telles que tu les as prises.'), {
      target: { value: 'Notes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Structurer' }))
    await waitFor(() => expect(cascade).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Aucune prochaine étape identifiée dans ce compte rendu.')).toBeInTheDocument()
  })
})
