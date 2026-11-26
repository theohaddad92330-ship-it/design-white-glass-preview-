import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * #2103.7 / #2103.24-.26 — SANS NOTES.
 *
 * L'issue #2103 liste « Aucune note pour l'instant » comme une entrée à part
 * entière, et demande trois questions courtes tant qu'il n'y a rien à
 * structurer. Il n'y a rien à SÉLECTIONNER de plus ici : ne rien taper EST
 * « aucune note pour l'instant » — le bouton « Structurer » reste déjà fermé
 * (`disabled={!notes.trim()}`), donc aucune sortie ne se crée sur un champ
 * vide (2103.7, déjà là). Les trois questions sont l'ajout de ce lot : elles
 * guident sans rien écrire à la place de l'utilisateur (doctrine : rien
 * n'écrit seul).
 */

const cascade = () => {}

vi.mock('../api', () => ({
  useTranscriptionStatus: () => ({ data: { available: false } }),
  useTranscribe: () => ({ mutateAsync: cascade, isPending: false }),
  useCreateNoteTasks: () => ({ mutateAsync: cascade, isPending: false }),
  useExtractMeetingDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  readFileAsBase64: async () => 'QUJD',
}))
vi.mock('@/features/meetings/api', () => ({
  useMeetingCascade: () => ({ mutateAsync: cascade, isPending: false }),
  useApproveInternal: () => ({ mutateAsync: cascade, isPending: false }),
}))
vi.mock('@/features/mailbox/api', () => ({
  useMailboxStatus: () => ({ data: undefined }),
  useCreateDraft: () => ({ mutateAsync: cascade }),
}))
vi.mock('@/features/meetings/view/MeetingCascade', () => ({ MeetingCascade: () => null }))
vi.mock('@/features/crm/hooks/useCrmPresence', () => ({ useCrmPresence: () => ({ data: undefined }) }))
vi.mock('@/features/crm/hooks/useCrmDealPipelines', () => ({
  useCrmDealPipelines: () => ({ data: undefined, isError: false }),
}))

const { MeetingNotesCard } = await import('./MeetingNotesCard')

describe('MeetingNotesCard — #2103.24-.26 : les trois questions sans notes', () => {
  it('les propose tant que le champ est vide, et le bouton Structurer reste fermé', () => {
    render(<MeetingNotesCard accountId="acc-1" />)

    expect(screen.getByText('Qu’as-tu appris ?')).toBeInTheDocument()
    expect(screen.getByText('Quelle suite a été convenue ?')).toBeInTheDocument()
    expect(screen.getByText('Qui fait quoi et pour quand ?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Structurer' })).toBeDisabled()
  })

  it('disparaissent dès qu’une note existe', () => {
    render(<MeetingNotesCard accountId="acc-1" />)
    const textarea = screen.getByPlaceholderText('Tes notes brutes, telles que tu les as prises.')
    fireEvent.change(textarea, { target: { value: 'Une première note' } })

    expect(screen.queryByText('Qu’as-tu appris ?')).not.toBeInTheDocument()
  })
})
