import type { MeetingRecap } from '@bellum/contracts'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #1903.12 — LE COMPTE RENDU S'ÉCRIT RÉELLEMENT DANS LE CARNET DU COMPTE.
 *
 * Avant ce lot, valider la carte « compte rendu » posait toujours `blocked` /
 * « il manque : le carnet du compte » — la porte d'écriture n'était jamais
 * branchée depuis l'écran. Ce test prouve l'APPELANT réel : le clic envoie
 * `recap: { accountId, body }`, avec le compte déjà ouvert sur cette fiche,
 * jamais deviné par l'API.
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
    <button type="button" onClick={() => onApprove(['recap'])}>
      Valider le compte rendu
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

describe('MeetingNotesCard — #1903.12 : le compte rendu écrit une note réelle', () => {
  // #3758 — `cascade`/`approve` sont des mocks PARTAGÉS par tout le fichier :
  // sans ce rappel, le second test hériterait de l'appel du premier et
  // `toHaveBeenCalledTimes(1)` ne prouverait plus rien.
  beforeEach(() => {
    cascade.mockClear()
    approve.mockClear()
  })

  it('envoie le compte déjà ouvert et le texte du compte rendu, jamais deviné par l’API', async () => {
    cascade.mockResolvedValue({ recap: recapFixture(), cascade: { cards: [], summary: {} } })
    approve.mockResolvedValue({ outcomes: [{ kind: 'recap', outcome: 'done', missing: null, detail: null }] })
    render(<MeetingNotesCard accountId="acc-42" />)
    fireEvent.change(screen.getByPlaceholderText('Tes notes brutes, telles que tu les as prises.'), {
      target: { value: 'Notes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Structurer' }))
    await waitFor(() => expect(cascade).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Valider le compte rendu' }))
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1))
    const body = approve.mock.calls[0]?.[0]
    expect(body.kinds).toEqual(['recap'])
    expect(body.recap).toEqual({
      accountId: 'acc-42',
      body: 'Camille cherche deux profils data pour septembre.\n\nOn avance sur le poste data engineer',
      // #3758 — l'instantané structuré que la carte `post_meeting_summary`
      // de Laura relira voyage AVEC le texte, pas à la place.
      snapshot: { decisions: ['On avance sur le poste data engineer'], nextSteps: [], reminder: null },
    })
  })

  it('#3758 — sans décision, sans prochaine étape et sans relance, aucun instantané ne part — jamais un objet vide', async () => {
    const recap = { ...recapFixture(), decisions: [] }
    cascade.mockResolvedValue({ recap, cascade: { cards: [], summary: {} } })
    approve.mockResolvedValue({ outcomes: [{ kind: 'recap', outcome: 'done', missing: null, detail: null }] })
    render(<MeetingNotesCard accountId="acc-42" />)
    fireEvent.change(screen.getByPlaceholderText('Tes notes brutes, telles que tu les as prises.'), {
      target: { value: 'Notes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Structurer' }))
    await waitFor(() => expect(cascade).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Valider le compte rendu' }))
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1))
    expect(approve.mock.calls[0]?.[0].recap.snapshot).toBeNull()
  })
})
