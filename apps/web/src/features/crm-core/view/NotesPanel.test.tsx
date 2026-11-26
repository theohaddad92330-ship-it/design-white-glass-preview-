import type { Note } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotesPanel } from './NotesPanel'

const notes = vi.fn()
const create = vi.fn()

vi.mock('../hooks/useNotes', () => ({
  useNotes: () => notes(),
  useGroupEntities: () => ({ data: [] }),
  useCreateNote: () => ({ mutate: create, isPending: false }),
  useUpdateNote: () => ({ mutate: vi.fn() }),
  useDeleteNote: () => ({ mutate: vi.fn() }),
}))

function note(index: number, overrides: Partial<Note> = {}): Note {
  return {
    id: `n-${index}`,
    body: `Note numéro ${index}`,
    pinned: false,
    authorId: index % 2 === 0 ? 'u-1' : 'u-2',
    authorName: index % 2 === 0 ? 'Camille Roux' : 'Alex Martin',
    createdAt: new Date(Date.UTC(2026, 9, index + 1, 9)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 9, index + 1, 9)).toISOString(),
    alsoAppliesTo: [],
    inheritedFrom: null,
    ...overrides,
  } as Note
}

const ok = (list: Note[]) => ({ data: list, isLoading: false, isError: false })
const renderPanel = () => render(<NotesPanel entityType="contact" entityId="c-1" currentUserId="u-1" />)

describe('NotesPanel — saisie protégée et liste compacte (#3688)', () => {
  beforeEach(() => {
    notes.mockReset()
    create.mockReset()
    window.sessionStorage.clear()
  })

  it('#3688.9 — un brouillon non enregistré survit à la navigation, et le dit', () => {
    notes.mockReturnValue(ok([]))
    const first = renderPanel()
    fireEvent.change(screen.getByLabelText('Nouvelle note'), { target: { value: 'Budget gelé jusqu’en janvier' } })
    expect(screen.getByText(/Brouillon conservé/)).toBeInTheDocument()
    first.unmount()

    renderPanel()
    expect(screen.getByLabelText('Nouvelle note')).toHaveValue('Budget gelé jusqu’en janvier')
  })

  it('#3688.9 — le brouillon n’est effacé qu’APRÈS la confirmation d’enregistrement, jamais avant', () => {
    notes.mockReturnValue(ok([]))
    renderPanel()
    fireEvent.change(screen.getByLabelText('Nouvelle note'), { target: { value: 'À garder' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la note' }))
    expect(create).toHaveBeenCalledTimes(1)
    // Pas encore confirmé : le texte est toujours là.
    expect(screen.getByLabelText('Nouvelle note')).toHaveValue('À garder')
    const [, options] = create.mock.calls[0] as [unknown, { onSuccess: () => void }]
    options.onSuccess()
    expect(window.sessionStorage.getItem('bellum:note-draft:contact:c-1')).toBeNull()
  })

  it('#3688.9 — fermer l’onglet avec une saisie en cours demande confirmation ; sans saisie, jamais', () => {
    notes.mockReturnValue(ok([]))
    renderPanel()
    const quiet = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(quiet)
    expect(quiet.defaultPrevented).toBe(false)

    fireEvent.change(screen.getByLabelText('Nouvelle note'), { target: { value: 'Pas enregistrée' } })
    const guarded = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(guarded)
    expect(guarded.defaultPrevented).toBe(true)
  })

  it('#3688 — la liste est compacte : 3 notes d’abord, le reste à la demande, sans rien perdre', () => {
    notes.mockReturnValue(ok([5, 4, 3, 2, 1].map(index => note(index))))
    renderPanel()
    expect(screen.getAllByText(/^Note numéro/)).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: /Voir les 5 notes/ }))
    expect(screen.getAllByText(/^Note numéro/)).toHaveLength(5)
  })

  it('#3688.5 — auteur et date sur chaque note ; seules MES notes offrent la suppression', () => {
    notes.mockReturnValue(ok([note(2), note(1)]))
    renderPanel()
    expect(screen.getByText('Camille Roux')).toBeInTheDocument()
    expect(screen.getByText('Alex Martin')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Supprimer la note' })).toHaveLength(1)
  })
})
