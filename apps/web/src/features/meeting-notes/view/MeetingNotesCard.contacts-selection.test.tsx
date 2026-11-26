import type { MeetingRecap } from '@bellum/contracts'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2319.93 — ACCEPTER / MODIFIER / REFUSER CHAQUE ÉLÉMENT INDIVIDUELLEMENT.
 *
 * `POST cascade/approve` acceptait déjà un lot d'UN SEUL `kind` (le bouton
 * « Valider » de chaque carte n'envoie que `[card.kind]`) — mais à l'intérieur
 * d'une carte à plusieurs objets (« 3 personnes citées »), les trois partaient
 * toujours ensemble, sans qu'aucune ne puisse être retirée ou corrigée avant
 * l'écriture. Ce fichier prouve la granularité PAR ÉLÉMENT sur la carte
 * « personnes citées » : une case à cocher REFUSE une personne sans toucher
 * aux autres, un champ texte MODIFIE ce qui partira, et décocher tout le monde
 * n'envoie aucune écriture vide.
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
    <button type="button" onClick={() => onApprove(['contacts'])}>
      Valider les personnes citées
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
    mentionedContacts: [
      { fullName: 'Camille Rey', role: 'DSI', evidence: { kind: 'notes-derived' } },
      { fullName: 'Théo Martin', role: '', evidence: { kind: 'notes-derived' } },
      { fullName: 'Nina Costa', role: 'RH', evidence: { kind: 'notes-derived' } },
    ],
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

async function structureAndGetRows() {
  cascade.mockResolvedValue({ recap: recapFixture(), cascade: { cards: [], summary: {} } })
  render(<MeetingNotesCard accountId="acc-42" />)
  fireEvent.change(screen.getByPlaceholderText('Tes notes brutes, telles que tu les as prises.'), {
    target: { value: 'Notes' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Structurer' }))
  await waitFor(() => expect(cascade).toHaveBeenCalledTimes(1))
}

describe('MeetingNotesCard — #2319.93 : accepter/modifier/refuser chaque personne citée', () => {
  beforeEach(() => {
    cascade.mockClear()
    approve.mockClear()
  })

  it('affiche une ligne éditable par personne citée, prête à valider telle quelle', async () => {
    await structureAndGetRows()
    expect(screen.getByDisplayValue('Camille Rey')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Théo Martin')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Nina Costa')).toBeInTheDocument()
  })

  it('refuse une seule personne sans toucher aux deux autres', async () => {
    await structureAndGetRows()
    approve.mockResolvedValue({ outcomes: [{ kind: 'contacts', outcome: 'partial', missing: null, detail: null }] })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Retenir Théo Martin' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valider les personnes citées' }))
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1))

    const body = approve.mock.calls[0]?.[0]
    expect(body.contacts).toEqual({
      accountId: 'acc-42',
      mentioned: [
        { fullName: 'Camille Rey', role: 'DSI' },
        { fullName: 'Nina Costa', role: 'RH' },
      ],
    })
  })

  it('modifie le nom et le rôle avant validation — ce qui part est ce qui a été corrigé', async () => {
    await structureAndGetRows()
    approve.mockResolvedValue({ outcomes: [{ kind: 'contacts', outcome: 'done', missing: null, detail: null }] })

    fireEvent.change(screen.getByDisplayValue('Théo Martin'), { target: { value: 'Théo Martin-Dupuis' } })
    fireEvent.change(screen.getByLabelText('Rôle de Théo Martin-Dupuis'), { target: { value: 'CTO' } })
    fireEvent.click(screen.getByRole('button', { name: 'Valider les personnes citées' }))
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1))

    const body = approve.mock.calls[0]?.[0]
    expect(body.contacts.mentioned).toContainEqual({ fullName: 'Théo Martin-Dupuis', role: 'CTO' })
  })

  it("décocher toutes les personnes n'envoie aucune écriture vide", async () => {
    await structureAndGetRows()
    approve.mockResolvedValue({ outcomes: [{ kind: 'contacts', outcome: 'skipped', missing: null, detail: null }] })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Retenir Camille Rey' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Retenir Théo Martin' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Retenir Nina Costa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valider les personnes citées' }))
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1))

    const body = approve.mock.calls[0]?.[0]
    expect(body.contacts).toBeUndefined()
  })
})
