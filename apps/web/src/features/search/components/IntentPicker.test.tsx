import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IntentPicker } from './IntentPicker'

// Refonte Théo R1 — « Ce que tu veux obtenir », plusieurs choix possibles : les QUATRE objectifs les
// plus fréquents sont des pastilles, les autres (signal, référencement, concurrence, « un autre
// objectif ») sont sous « Autres objectifs ». Rien n'est retiré : #2162.20 (7 libellés + Autre) reste
// vrai, seulement rangé en deux endroits.
describe('IntentPicker (#1589, #2162.20, refonte Théo R1)', () => {
  it('montre les quatre objectifs principaux et UN menu pour tous les autres', () => {
    render(<IntentPicker preset="free" onPick={vi.fn()} />)
    for (const label of [
      'Ouvrir ce compte',
      'Préparer un rendez-vous',
      'Trouver les décideurs',
      'Comprendre le groupe',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: /Autres objectifs/ })).toBeInTheDocument()
    // Cinq boutons : quatre pastilles + le menu.
    expect(screen.getAllByRole('button')).toHaveLength(5)
    expect(screen.queryByRole('button', { name: 'Approfondir une analyse' })).not.toBeInTheDocument()
  })

  it('un clic sur un objectif appelle onPick avec le preset EXISTANT correspondant', () => {
    const onPick = vi.fn()
    render(<IntentPicker preset="free" onPick={onPick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Préparer un rendez-vous' }))
    expect(onPick).toHaveBeenCalledWith('known-account')
  })

  it('les autres objectifs vivent sous « Autres objectifs », « Un autre objectif » compris', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<IntentPicker preset="strategic" onPick={onPick} />)
    await user.click(screen.getByRole('button', { name: /Autres objectifs/ }))
    for (const label of [
      'Vérifier un signal',
      'Préparer un référencement',
      'Situer les partenaires et concurrents',
      'Un autre objectif',
    ]) {
      expect(await screen.findByRole('menuitemcheckbox', { name: label })).toBeInTheDocument()
    }
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Vérifier un signal' }))
    expect(onPick).toHaveBeenLastCalledWith('signal')
  })

  it('« Un autre objectif » appelle onPick avec "free" — la porte de sortie reste', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<IntentPicker preset="signal" onPick={onPick} />)
    await user.click(screen.getByRole('button', { name: /Autres objectifs/ }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Un autre objectif' }))
    expect(onPick).toHaveBeenCalledWith('free')
  })

  it('le menu annonce combien d’objectifs il porte déjà', () => {
    render(<IntentPicker preset="incumbent" onPick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Autres objectifs, 1 retenu(s)' })).toBeInTheDocument()
  })

  // #4086 — « Ouvrir ce compte » et « Trouver les décideurs » partagent le preset `strategic` :
  // l'état « actif » est porté par le LIBELLÉ cliqué : un clic = un intent.
  it('#4086 — un clic coche UN seul intent, même si un autre partage son preset', () => {
    render(<IntentPicker preset="free" onPick={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Trouver les décideurs' }))
    expect(screen.getByRole('button', { name: 'Trouver les décideurs' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Ouvrir ce compte' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('#4086 — multi-sélection additive : on en coche plusieurs, un re-clic désélectionne', () => {
    const onPick = vi.fn()
    render(<IntentPicker preset="free" onPick={onPick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Préparer un rendez-vous' }))
    fireEvent.click(screen.getByRole('button', { name: 'Comprendre le groupe' }))
    expect(screen.getByRole('button', { name: 'Préparer un rendez-vous' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Comprendre le groupe' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Comprendre le groupe' }))
    expect(screen.getByRole('button', { name: 'Comprendre le groupe' })).toHaveAttribute('aria-pressed', 'false')
    expect(onPick).toHaveBeenLastCalledWith('known-account')
    fireEvent.click(screen.getByRole('button', { name: 'Préparer un rendez-vous' }))
    expect(onPick).toHaveBeenLastCalledWith('free')
  })

  it('#4086 — preset d’arrivée partagé (URL) : un seul libellé allumé, pas deux', () => {
    render(<IntentPicker preset="strategic" onPick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Ouvrir ce compte' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Trouver les décideurs' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('rapporte les libellés cochés à l’écran, pour que la vérification les rappelle', () => {
    const onSelectedChange = vi.fn()
    render(<IntentPicker preset="strategic" onPick={vi.fn()} onSelectedChange={onSelectedChange} />)
    expect(onSelectedChange).toHaveBeenLastCalledWith(['intent.openAccount'])
    fireEvent.click(screen.getByRole('button', { name: 'Trouver les décideurs' }))
    expect(onSelectedChange).toHaveBeenLastCalledWith(['intent.openAccount', 'intent.findDecisionMakers'])
  })
})
