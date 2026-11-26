import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TalentEraseDialog } from './TalentEraseDialog'

function renderDialog(over: Partial<Parameters<typeof TalentEraseDialog>[0]> = {}) {
  const props = { count: 3, open: true, pending: false, onOpenChange: vi.fn(), onConfirm: vi.fn(), ...over }
  render(<TalentEraseDialog {...props} />)
  return props
}

/**
 * #3781 — la confirmation de « Supprimer définitivement » : la conséquence est
 * annoncée AVANT le clic, et le bouton ne s'arme qu'une fois le mot tapé.
 */
describe('TalentEraseDialog', () => {
  it('annonce la conséquence : effacement RGPD, sans retour, trace sans donnée personnelle', () => {
    renderDialog()
    expect(screen.getByText('Supprimer définitivement 3 personnes ?')).not.toBeNull()
    expect(screen.getByText(/effacement RGPD/)).not.toBeNull()
    expect(screen.getByText(/sans aucune donnée personnelle/)).not.toBeNull()
  })

  it('le bouton est INERTE tant que le mot n’est pas tapé', () => {
    const props = renderDialog()
    const confirm = screen.getByRole('button', { name: 'Supprimer définitivement 3 personnes' })
    expect(confirm).toBeDisabled()
    fireEvent.click(confirm)
    expect(props.onConfirm).not.toHaveBeenCalled()
  })

  it('SAIT DIRE NON : un autre mot n’arme pas le bouton', () => {
    renderDialog()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'archiver' } })
    expect(screen.getByRole('button', { name: 'Supprimer définitivement 3 personnes' })).toBeDisabled()
  })

  it('tapé (casse indifférente), le bouton s’arme et confirme UNE fois', () => {
    const props = renderDialog()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'supprimer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer définitivement 3 personnes' }))
    expect(props.onConfirm).toHaveBeenCalledTimes(1)
  })

  it('reste inerte pendant la mutation, même armé', () => {
    renderDialog({ pending: true })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'SUPPRIMER' } })
    expect(screen.getByRole('button', { name: 'Supprimer définitivement 3 personnes' })).toBeDisabled()
  })

  it('annuler ferme sans rien confirmer', () => {
    const props = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
    expect(props.onConfirm).not.toHaveBeenCalled()
  })
})
