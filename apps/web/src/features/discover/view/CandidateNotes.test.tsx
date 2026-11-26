import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

const notesList = vi.fn()
const notesCreate = vi.fn()

vi.mock('@/features/discover/api/discover-api', () => ({
  discoverApi: {
    notes: {
      list: (...args: unknown[]) => notesList(...args),
      create: (...args: unknown[]) => notesCreate(...args),
    },
  },
}))

import { CandidateNotes } from './CandidateNotes'

const SIREN = '441602748'

beforeEach(() => {
  notesList.mockReset()
  notesCreate.mockReset()
})

/**
 * #2151.59 — Décision de Louis du 18/09 : un commercial peut écrire une note
 * libre sur un candidat Découvrir, et la retrouver. Ce test échoue si le
 * champ de saisie ou la liste des notes déjà écrites disparaît du composant.
 */
describe('CandidateNotes — le champ et la liste (#2151.59)', () => {
  it('affiche le champ de saisie ET la liste des notes déjà écrites', async () => {
    notesList.mockResolvedValue({
      notes: [
        {
          id: 'n1',
          body: 'Programme de transformation à qualifier avant octobre.',
          createdAt: '2026-09-10T09:00:00.000Z',
          authorId: 'u1',
          authorName: 'Louis Schlegel',
        },
        {
          id: 'n2',
          body: 'Deux ESN déjà en place sur ce périmètre.',
          createdAt: '2026-09-11T09:00:00.000Z',
          authorId: 'u2',
          authorName: 'Camille Perrin',
        },
      ],
    })
    renderWithRouter(<CandidateNotes siren={SIREN} candidateName="Doctolib" />)

    // Le champ de saisie.
    expect(await screen.findByRole('textbox', { name: /doctolib/i })).toBeInTheDocument()

    // La liste des notes déjà écrites.
    expect(await screen.findByText('Programme de transformation à qualifier avant octobre.')).toBeInTheDocument()
    expect(await screen.findByText('Deux ESN déjà en place sur ce périmètre.')).toBeInTheDocument()
    expect(screen.getByText('Louis Schlegel')).toBeInTheDocument()
    expect(screen.getByText('Camille Perrin')).toBeInTheDocument()
  })

  it('appelle la lecture avec le SIREN du candidat', async () => {
    notesList.mockResolvedValue({ notes: [] })
    renderWithRouter(<CandidateNotes siren={SIREN} candidateName="Doctolib" />)
    await waitFor(() => expect(notesList).toHaveBeenCalledWith(SIREN, expect.anything()))
  })

  /** GA-18 / GA-19 — une valeur absente ne s'affiche jamais « 0 ». */
  it('zéro note se lit « aucune note », jamais « 0 »', async () => {
    notesList.mockResolvedValue({ notes: [] })
    renderWithRouter(<CandidateNotes siren={SIREN} candidateName="Doctolib" />)
    const empty = await screen.findByText('Aucune note pour ce candidat.')
    expect(empty).toBeInTheDocument()
    expect(screen.queryByText(/^0/)).toBeNull()
  })

  it('écrit une note et vide le champ après succès', async () => {
    notesList.mockResolvedValue({ notes: [] })
    notesCreate.mockResolvedValue({
      id: 'n3',
      body: 'À vérifier au prochain point.',
      createdAt: '2026-09-18T09:00:00.000Z',
      authorId: 'u1',
      authorName: 'Louis Schlegel',
    })
    renderWithRouter(<CandidateNotes siren={SIREN} candidateName="Doctolib" />)

    const field = await screen.findByRole('textbox', { name: /doctolib/i })
    fireEvent.change(field, { target: { value: '  À vérifier au prochain point.  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la note' }))

    await waitFor(() => expect(notesCreate).toHaveBeenCalledWith(SIREN, 'À vérifier au prochain point.'))
    await waitFor(() => expect(field).toHaveValue(''))
  })

  it('le bouton reste désactivé tant que le champ est vide', async () => {
    notesList.mockResolvedValue({ notes: [] })
    renderWithRouter(<CandidateNotes siren={SIREN} candidateName="Doctolib" />)
    expect(await screen.findByRole('button', { name: 'Ajouter la note' })).toBeDisabled()
  })
})
