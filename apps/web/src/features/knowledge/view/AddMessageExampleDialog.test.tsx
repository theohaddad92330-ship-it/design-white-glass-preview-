import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const mutate = vi.hoisted(() => vi.fn())
vi.mock('@/features/message-library/hooks/useCreateMessageLibraryEntry', () => ({
  useCreateMessageLibraryEntry: () => ({ mutate, isPending: false }),
}))

const { AddMessageExampleDialog } = await import('./AddMessageExampleDialog')

// #4158.50 — créer un exemple depuis l'écran : visibilité « équipe » par défaut.
describe('AddMessageExampleDialog (#4158.50)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    mutate.mockReset()
  })

  it('ne propose pas d’ajouter tant que le titre et le texte sont vides', () => {
    render(<AddMessageExampleDialog open onOpenChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeDisabled()
  })

  it('envoie l’exemple partagé avec l’équipe par défaut, à revoir et en inspiration', () => {
    render(<AddMessageExampleDialog open onOpenChange={() => {}} />)
    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Relance douce' } })
    fireEvent.change(screen.getByLabelText('Texte du message'), { target: { value: 'Bonjour, je reviens vers vous.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0]?.[0]).toMatchObject({
      title: 'Relance douce',
      text: 'Bonjour, je reviens vers vous.',
      channel: 'linkedin_draft',
      visibility: 'team',
      status: 'a_revoir',
      mode: 'inspiration',
    })
  })

  it('passe en personnel quand la case « Partager avec l’équipe » est décochée', () => {
    render(<AddMessageExampleDialog open onOpenChange={() => {}} />)
    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'T' } })
    fireEvent.change(screen.getByLabelText('Texte du message'), { target: { value: 'X' } })
    fireEvent.click(screen.getByLabelText('Partager avec l’équipe'))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(mutate.mock.calls[0]?.[0]).toMatchObject({ visibility: 'personal' })
  })
})
