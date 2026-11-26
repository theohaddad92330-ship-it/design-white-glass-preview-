import type { Note } from '@bellum/contracts'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotesPanel } from './NotesPanel'

const notes = vi.fn()
const groupEntities = vi.fn()
const create = vi.fn()
const update = vi.fn()

vi.mock('../hooks/useNotes', () => ({
  useNotes: () => notes(),
  useGroupEntities: () => groupEntities(),
  useCreateNote: () => ({ mutate: create, isPending: false }),
  useUpdateNote: () => ({ mutate: update, isPending: false }),
  useDeleteNote: () => ({ mutate: vi.fn() }),
}))

const base: Note = {
  id: 'n-1',
  entityType: 'account',
  entityId: 'a-sanofi',
  body: 'Grille achats : trois devis, 45 jours.',
  authorId: 'u-2',
  authorName: 'Alex Martin',
  pinned: false,
  createdAt: '2026-10-11T09:00:00.000Z',
  updatedAt: '2026-10-11T09:00:00.000Z',
  alsoAppliesTo: [],
  inheritedFrom: null,
}
const ok = (list: Note[]) => ({ data: list, isLoading: false, isError: false })

// #3895 — la portée entité du groupe : une note achats écrite sur le groupe vaut pour une entité qu'on NOMME.
describe('NotesPanel — portée entité du groupe (#3895)', () => {
  beforeEach(() => {
    notes.mockReset()
    groupEntities.mockReset()
    create.mockReset()
    update.mockReset()
    window.sessionStorage.clear()
  })

  // #3895.1 — la portée d'une note se MODIFIE depuis la note elle-même (l'API `PATCH /notes/:id` l'accepte).
  describe('éditer la portée depuis la note', () => {
    const entities = [
      { id: 'a-pasteur', name: 'Sanofi Pasteur' },
      { id: 'a-genzyme', name: 'Sanofi Genzyme' },
    ]

    it('un contrôle sur la note ouvre les entités du groupe, celles déjà couvertes cochées, et enregistre le NOUVEL ensemble', () => {
      notes.mockReturnValue(
        ok([{ ...base, authorId: 'u-1', alsoAppliesTo: [{ id: 'a-pasteur', name: 'Sanofi Pasteur' }] }]),
      )
      groupEntities.mockReturnValue({ data: entities })
      render(<NotesPanel entityType="account" entityId="a-sanofi" currentUserId="u-1" />)
      fireEvent.click(screen.getByRole('button', { name: 'Modifier la portée' }))
      // Deux fieldsets possibles (compositeur + note) : on cible celui de la note.
      const scope = screen.getByRole('group', { name: 'Portée de la note' })
      const pasteur = within(scope).getByRole('checkbox', { name: 'Sanofi Pasteur' })
      const genzyme = within(scope).getByRole('checkbox', { name: 'Sanofi Genzyme' })
      expect(pasteur).toBeChecked()
      expect(genzyme).not.toBeChecked()
      fireEvent.click(pasteur)
      fireEvent.click(genzyme)
      fireEvent.click(within(scope).getByRole('button', { name: 'Enregistrer la portée' }))
      expect(update).toHaveBeenCalledWith({ id: 'n-1', alsoAppliesToAccountIds: ['a-genzyme'] })
    })

    it('SAIT DIRE NON — pas l’auteur, note héritée, ou aucune entité du groupe : aucun contrôle de portée', () => {
      groupEntities.mockReturnValue({ data: entities })
      notes.mockReturnValue(ok([{ ...base, authorId: 'u-2' }]))
      const first = render(<NotesPanel entityType="account" entityId="a-sanofi" currentUserId="u-1" />)
      expect(screen.queryByRole('button', { name: 'Modifier la portée' })).toBeNull()
      first.unmount()
      notes.mockReturnValue(ok([{ ...base, authorId: 'u-1', inheritedFrom: { id: 'a-sanofi', name: 'Sanofi' } }]))
      const second = render(<NotesPanel entityType="account" entityId="a-pasteur" currentUserId="u-1" />)
      expect(screen.queryByRole('button', { name: 'Modifier la portée' })).toBeNull()
      second.unmount()
      notes.mockReturnValue(ok([{ ...base, authorId: 'u-1' }]))
      groupEntities.mockReturnValue({ data: [] })
      render(<NotesPanel entityType="account" entityId="a-solo" currentUserId="u-1" />)
      expect(screen.queryByRole('button', { name: 'Modifier la portée' })).toBeNull()
    })
  })

  it('une note héritée dit d’où elle vient — jamais présentée comme écrite ici', () => {
    notes.mockReturnValue(ok([{ ...base, inheritedFrom: { id: 'a-sanofi', name: 'Sanofi' } }]))
    groupEntities.mockReturnValue({ data: [] })
    render(<NotesPanel entityType="account" entityId="a-pasteur" currentUserId="u-1" />)
    expect(screen.getByText(/Écrite sur Sanofi \(même groupe\)/)).toBeInTheDocument()
  })

  it('une note venue d’un serveur sans la portée de groupe (champs absents, `.default` du contrat) se lit quand même', () => {
    // Le contrat déclare `alsoAppliesTo`/`inheritedFrom` avec un défaut : absents sur le fil, ils ne
    // doivent pas faire tomber le fil (golden journey 28 — la note créée disparaissait).
    const { alsoAppliesTo: _a, inheritedFrom: _i, ...wire } = base
    notes.mockReturnValue(ok([wire as Note]))
    groupEntities.mockReturnValue({ data: [] })
    render(<NotesPanel entityType="mission" entityId="m-1" currentUserId="u-1" />)
    expect(screen.getByText('Grille achats : trois devis, 45 jours.')).toBeInTheDocument()
  })

  it('une note écrite ici nomme les entités pour lesquelles elle vaut aussi', () => {
    notes.mockReturnValue(ok([{ ...base, alsoAppliesTo: [{ id: 'a-pasteur', name: 'Sanofi Pasteur' }] }]))
    groupEntities.mockReturnValue({ data: [] })
    render(<NotesPanel entityType="account" entityId="a-sanofi" currentUserId="u-1" />)
    expect(screen.getByText(/Vaut aussi pour : Sanofi Pasteur/)).toBeInTheDocument()
  })

  it('rattacher une note à une entité du groupe est un geste explicite, jamais coché d’office', () => {
    notes.mockReturnValue(ok([]))
    groupEntities.mockReturnValue({ data: [{ id: 'a-pasteur', name: 'Sanofi Pasteur' }] })
    render(<NotesPanel entityType="account" entityId="a-sanofi" currentUserId="u-1" />)
    const box = screen.getByRole('checkbox', { name: 'Sanofi Pasteur' })
    expect(box).not.toBeChecked()

    fireEvent.change(screen.getByLabelText('Nouvelle note'), { target: { value: 'Règle achats' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la note' }))
    expect(create).toHaveBeenLastCalledWith(
      { body: 'Règle achats', alsoAppliesToAccountIds: undefined },
      expect.anything(),
    )

    fireEvent.click(box)
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la note' }))
    expect(create).toHaveBeenLastCalledWith(
      { body: 'Règle achats', alsoAppliesToAccountIds: ['a-pasteur'] },
      expect.anything(),
    )
  })

  it('sait dire NON : sans entité du groupe, aucun choix n’est proposé ; un contact n’en a jamais', () => {
    notes.mockReturnValue(ok([]))
    groupEntities.mockReturnValue({ data: [] })
    const { unmount } = render(<NotesPanel entityType="account" entityId="a-solo" currentUserId="u-1" />)
    expect(screen.queryByRole('checkbox')).toBeNull()
    unmount()
    groupEntities.mockReturnValue({ data: [{ id: 'x', name: 'Autre' }] })
    render(<NotesPanel entityType="contact" entityId="c-1" currentUserId="u-1" />)
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})
