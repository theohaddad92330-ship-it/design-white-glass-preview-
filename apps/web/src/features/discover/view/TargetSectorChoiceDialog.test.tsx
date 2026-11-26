import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { APPLICATION_SECTORS } from '@bellum/contracts'
import { TargetSectorChoiceDialog } from './TargetSectorChoiceDialog'

/**
 * #3528 — la cible compte plus de 5 secteurs : l'écran DEMANDE de choisir.
 *
 * #3848.1 (lot V01, 08/10) — RETOURNÉ (Louis, retour bêta 08/10) : les cinq
 * premiers partaient pré-cochés (« l'action principale reste un clic »,
 * #3528 01/10). Signalé en bêta sept jours plus tard : « arrêté de toujours
 * présélectionner, il faut repartir de 0 à chaque fois ». Pas une doctrine du
 * registre (`doctrine-registry.ts`) — un réglage produit ordinaire, changé
 * par son propre auteur. La liste part donc VIDE : rien de coché tant que le
 * commercial n'a rien choisi, « Appliquer » reste désactivé jusque-là.
 */
const SEVEN = APPLICATION_SECTORS.slice(0, 7).map(sector => sector.code)

function renderDialog() {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(<TargetSectorChoiceDialog sectors={SEVEN} onConfirm={onConfirm} onCancel={onCancel} />)
  return { onConfirm, onCancel }
}

describe('TargetSectorChoiceDialog — #3528 / #3848.1', () => {
  it('#3848.1 — ne pré-coche plus rien : on repart de 0 à chaque ouverture', () => {
    renderDialog()
    const chips = screen.getAllByRole('button').filter(button => button.getAttribute('aria-pressed') !== null)
    expect(chips).toHaveLength(7)
    expect(chips.every(chip => chip.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(screen.getByRole('button', { name: 'Appliquer ces secteurs' })).toBeDisabled()
  })

  it('choisir 5 secteurs puis appliquer les transmet tels quels', () => {
    const { onConfirm } = renderDialog()
    const chips = screen.getAllByRole('button').filter(button => button.getAttribute('aria-pressed') !== null)
    for (const chip of chips.slice(0, 5)) fireEvent.click(chip)
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer ces secteurs' }))
    expect(onConfirm).toHaveBeenCalledWith(SEVEN.slice(0, 5))
  })

  it('⚠️ SAIT DIRE NON — un sixième secteur ne se coche pas tant qu’on n’en a pas décoché un', () => {
    const { onConfirm } = renderDialog()
    const chips = screen.getAllByRole('button').filter(button => button.getAttribute('aria-pressed') !== null)
    for (const chip of chips.slice(0, 5)) fireEvent.click(chip)
    fireEvent.click(chips[5])
    expect(chips[5]).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(chips[0])
    fireEvent.click(chips[5])
    expect(chips[5]).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer ces secteurs' }))
    expect(onConfirm.mock.calls[0][0]).toHaveLength(5)
  })

  it('« Appliquer » est désactivé à zéro secteur, jamais une recherche sans secteur', () => {
    renderDialog()
    const chips = screen.getAllByRole('button').filter(button => button.getAttribute('aria-pressed') !== null)
    fireEvent.click(chips[0])
    expect(screen.getByRole('button', { name: 'Appliquer ces secteurs' })).not.toBeDisabled()
    fireEvent.click(chips[0])
    expect(screen.getByRole('button', { name: 'Appliquer ces secteurs' })).toBeDisabled()
  })

  it('Annuler n’applique rien', () => {
    const { onConfirm, onCancel } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
