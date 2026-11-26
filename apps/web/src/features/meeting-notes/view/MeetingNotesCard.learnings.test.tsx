import type { MeetingRecap } from '@bellum/contracts'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * #2777 — LES APPRENTISSAGES S'ÉCRIVENT RÉELLEMENT DANS LA MÉMOIRE DU COMPTE.
 *
 * Avant ce lot, valider la carte « apprentissages » posait toujours `blocked`
 * / « il manque : la mémoire du compte » — la porte n'était jamais branchée
 * depuis l'écran. Ce test prouve l'APPELANT réel : le clic envoie
 * `learnings: { accountId, entries }`, avec le compte déjà ouvert sur cette
 * fiche, jamais deviné par l'API.
 */

const cascade = vi.fn()
const approve = vi.fn()

vi.mock('../api', () => ({
  useTranscriptionStatus: () => ({ data: { available: false } }),
  useTranscribe: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateNoteTasks: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useExtractMeetingDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  readFileAsBase64: async () => 'QUJD',
}))
vi.mock('@/features/meetings/api', () => ({
  useMeetingCascade: () => ({ mutateAsync: cascade, isPending: false }),
  useApproveInternal: () => ({ mutateAsync: approve, isPending: false }),
}))
vi.mock('@/features/mailbox/api', () => ({
  useMailboxStatus: () => ({ data: undefined }),
  useCreateDraft: () => ({ mutateAsync: vi.fn() }),
}))
// Le composant réel affiche une carte par sortie ; on ne teste pas son rendu
// ici (couvert ailleurs), seulement l'appel qu'il déclenche.
vi.mock('@/features/meetings/view/MeetingCascade', () => ({
  MeetingCascade: ({ onApprove }: { onApprove: (kinds: string[]) => void }) => (
    <button type="button" onClick={() => onApprove(['learnings'])}>
      Valider les apprentissages
    </button>
  ),
}))
vi.mock('@/features/crm/hooks/useCrmPresence', () => ({ useCrmPresence: () => ({ data: undefined }) }))
vi.mock('@/features/crm/hooks/useCrmDealPipelines', () => ({
  useCrmDealPipelines: () => ({ data: undefined, isError: false }),
}))

const { MeetingNotesCard } = await import('./MeetingNotesCard')

function recapFixture(): MeetingRecap {
  return {
    summary: 'Camille cherche deux profils data pour septembre.',
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
    learnings: [
      { kind: 'objection', content: 'Budget gelé jusqu’en janvier.', evidence: { kind: 'notes-derived' } },
      { kind: 'commitment', content: 'Ils rappellent après le comité.', evidence: { kind: 'notes-derived' } },
    ],
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

describe('MeetingNotesCard — #2777 : les apprentissages s’écrivent réellement dans la mémoire du compte', () => {
  it('envoie le compte déjà ouvert et les apprentissages retenus, jamais deviné par l’API', async () => {
    cascade.mockResolvedValue({ recap: recapFixture(), cascade: { cards: [], summary: {} } })
    approve.mockResolvedValue({ outcomes: [{ kind: 'learnings', outcome: 'done', missing: null, detail: null }] })
    render(<MeetingNotesCard accountId="acc-42" />)
    fireEvent.change(screen.getByPlaceholderText('Tes notes brutes, telles que tu les as prises.'), {
      target: { value: 'Notes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Structurer' }))
    await waitFor(() => expect(cascade).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Valider les apprentissages' }))
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1))
    const body = approve.mock.calls[0]?.[0]
    expect(body.kinds).toEqual(['learnings'])
    expect(body.learnings).toEqual({
      accountId: 'acc-42',
      entries: [
        { kind: 'objection', content: 'Budget gelé jusqu’en janvier.' },
        { kind: 'commitment', content: 'Ils rappellent après le comité.' },
      ],
    })
  })
})
