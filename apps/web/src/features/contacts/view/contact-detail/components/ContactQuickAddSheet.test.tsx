import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { ContactQuickAddSheet } from './ContactQuickAddSheet'

const createNote = vi.fn()
const createTask = vi.fn()

vi.mock('@/features/crm-core/hooks/useNotes', () => ({
  useCreateNote: () => ({ mutate: createNote, isPending: false }),
}))
vi.mock('@/features/tasks/hooks/useTasks', () => ({
  useCreateTask: () => ({ mutate: createTask, isPending: false }),
}))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({ data: [] }),
}))

describe('ContactQuickAddSheet — #4135, une note OU une tâche sans quitter la fiche', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    createNote.mockReset()
    createTask.mockReset()
  })

  it('ne monte rien tant que la feuille est fermée', () => {
    render(<ContactQuickAddSheet contactId="c1" accountId="a1" />)
    expect(screen.getByRole('button', { name: 'Note ou tâche' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ajoute une NOTE liée au contact via l’endpoint existant, puis se referme', async () => {
    const user = userEvent.setup()
    render(<ContactQuickAddSheet contactId="c1" accountId="a1" />)
    await user.click(screen.getByRole('button', { name: 'Note ou tâche' }))
    const save = screen.getByRole('button', { name: 'Ajouter la note' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Rappeler jeudi' } })
    await user.click(save)
    expect(createNote).toHaveBeenCalledWith(
      { body: 'Rappeler jeudi' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    createNote.mock.calls[0]?.[1].onSuccess()
    expect(await screen.findByRole('button', { name: 'Note ou tâche' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('crée une TÂCHE liée au contact ET à son compte, avec les champs requis du formulaire existant', async () => {
    const user = userEvent.setup()
    render(<ContactQuickAddSheet contactId="c1" accountId="a1" />)
    await user.click(screen.getByRole('button', { name: 'Note ou tâche' }))
    await user.click(screen.getByRole('button', { name: 'Tâche' }))
    fireEvent.change(screen.getByLabelText('Intitulé'), { target: { value: 'Envoyer la proposition' } })
    fireEvent.change(screen.getByLabelText('Objectif (obligatoire)'), { target: { value: 'Avancer' } })
    fireEvent.change(screen.getByLabelText('Résultat attendu (obligatoire)'), { target: { value: 'Proposition lue' } })
    await user.click(screen.getByRole('button', { name: 'Créer' }))
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Envoyer la proposition', contactId: 'c1', accountId: 'a1' }),
      expect.anything(),
    )
  })

  it('sans compte rattaché, n’invente aucun accountId', async () => {
    const user = userEvent.setup()
    render(<ContactQuickAddSheet contactId="c1" accountId={null} />)
    await user.click(screen.getByRole('button', { name: 'Note ou tâche' }))
    await user.click(screen.getByRole('button', { name: 'Tâche' }))
    fireEvent.change(screen.getByLabelText('Intitulé'), { target: { value: 'X' } })
    fireEvent.change(screen.getByLabelText('Objectif (obligatoire)'), { target: { value: 'Y' } })
    fireEvent.change(screen.getByLabelText('Résultat attendu (obligatoire)'), { target: { value: 'Z' } })
    await user.click(screen.getByRole('button', { name: 'Créer' }))
    expect(createTask.mock.calls[0]?.[0].accountId).toBeUndefined()
  })
})
