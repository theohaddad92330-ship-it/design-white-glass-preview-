import type { MeetingRecap } from '@bellum/contracts'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * #2777 — LE BESOIN EXPRIMÉ S'ÉCRIT RÉELLEMENT DANS LE PIPE, SANS PROJET.
 *
 * Avant ce lot, valider la carte « besoin exprimé » posait toujours `blocked`
 * / « il manque : les besoins » — la porte n'était jamais branchée depuis
 * l'écran. Ce test prouve l'APPELANT réel : le clic envoie
 * `need: { accountId, title, detail }`, avec le compte déjà ouvert sur cette
 * fiche, jamais un projet deviné (#2558.1).
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
    <button type="button" onClick={() => onApprove(['need'])}>
      Valider le besoin
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
    need: {
      title: 'Deux profils data pour septembre',
      detail: 'Stack Python, remote ok',
      qualification: 'potential',
      evidence: { kind: 'notes-derived' },
    },
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

describe('MeetingNotesCard — #2777 : le besoin s’écrit réellement dans le pipe', () => {
  it('envoie le compte déjà ouvert et le besoin retenu, jamais un projet deviné', async () => {
    cascade.mockResolvedValue({ recap: recapFixture(), cascade: { cards: [], summary: {} } })
    approve.mockResolvedValue({ outcomes: [{ kind: 'need', outcome: 'done', missing: null, detail: null }] })
    render(<MeetingNotesCard accountId="acc-42" />)
    fireEvent.change(screen.getByPlaceholderText('Tes notes brutes, telles que tu les as prises.'), {
      target: { value: 'Notes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Structurer' }))
    await waitFor(() => expect(cascade).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Valider le besoin' }))
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1))
    const body = approve.mock.calls[0]?.[0]
    expect(body.kinds).toEqual(['need'])
    expect(body.need).toEqual({
      accountId: 'acc-42',
      title: 'Deux profils data pour septembre',
      detail: 'Stack Python, remote ok',
    })
  })
})
