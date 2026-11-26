import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { HandoffNoteDialog } from './HandoffNoteDialog'

// #4158.31 — déléguer exige une note : le bouton reste inerte tant qu'elle est vide.
describe('HandoffNoteDialog', () => {
  it('ne délègue pas sans note, et la demande est dite', () => {
    const onConfirm = vi.fn()
    render(<HandoffNoteDialog open assigneeName="Alix" onConfirm={onConfirm} onCancel={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Déléguer' })).toBeDisabled()
    expect(screen.getByText('Écris une note de contexte pour déléguer.')).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('une note faite d’espaces ne vaut pas une note', async () => {
    const onConfirm = vi.fn()
    render(<HandoffNoteDialog open assigneeName="Alix" onConfirm={onConfirm} onCancel={vi.fn()} />)

    await userEvent.setup().type(screen.getByLabelText('Note de contexte'), '   ')
    expect(screen.getByRole('button', { name: 'Déléguer' })).toBeDisabled()
  })

  it('envoie la note détourée', async () => {
    const onConfirm = vi.fn()
    render(<HandoffNoteDialog open assigneeName="Alix" onConfirm={onConfirm} onCancel={vi.fn()} />)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Note de contexte'), '  Rappeler avant jeudi ')
    await user.click(screen.getByRole('button', { name: 'Déléguer' }))

    expect(onConfirm).toHaveBeenCalledWith('Rappeler avant jeudi')
  })
})
