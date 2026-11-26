import type { MeetingRecap } from '@bellum/contracts'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * #2777 — L'OPPORTUNITÉ CANDIDATE SE PROPOSE RÉELLEMENT COMME DEAL.
 *
 * Avant ce lot, valider la carte « opportunité détectée » posait toujours
 * `blocked` / « il manque : ton CRM » — la porte n'était jamais branchée
 * depuis l'écran. Ce test prouve l'APPELANT réel : le clic envoie
 * `opportunity: { accountId, title }`, avec le compte déjà ouvert sur cette
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
    <button type="button" onClick={() => onApprove(['opportunity'])}>
      Valider l’opportunité
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
    opportunity: {
      title: 'Deux profils data pour septembre',
      accountName: '',
      qualification: 'to_qualify',
      evidence: { kind: 'notes-derived' },
    },
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

describe('MeetingNotesCard — #2777 : l’opportunité se propose réellement au CRM', () => {
  it('envoie le compte déjà ouvert et le titre retenu, jamais deviné par l’API', async () => {
    cascade.mockResolvedValue({ recap: recapFixture(), cascade: { cards: [], summary: {} } })
    approve.mockResolvedValue({ outcomes: [{ kind: 'opportunity', outcome: 'proposed', missing: null, detail: null }] })
    render(<MeetingNotesCard accountId="acc-42" />)
    fireEvent.change(screen.getByPlaceholderText('Tes notes brutes, telles que tu les as prises.'), {
      target: { value: 'Notes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Structurer' }))
    await waitFor(() => expect(cascade).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Valider l’opportunité' }))
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1))
    const body = approve.mock.calls[0]?.[0]
    expect(body.kinds).toEqual(['opportunity'])
    expect(body.opportunity).toEqual({ accountId: 'acc-42', title: 'Deux profils data pour septembre' })
  })
})
