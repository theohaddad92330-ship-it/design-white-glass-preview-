import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { i18n } from '@/i18n'
import { AddPlanActionForm } from './AddPlanActionForm'

// #2395.8 — la création d'une action du plan exige un OBJECTIF et un RÉSULTAT ATTENDU, chacun nommé à l'écran.
describe('AddPlanActionForm — objectif et résultat attendu requis', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  async function openForm() {
    const user = userEvent.setup()
    render(<AddPlanActionForm onAdd={onAdd} />)
    await user.click(screen.getByRole('button', { name: 'Ajouter une action' }))
    return user
  }
  const onAdd = vi.fn()

  it('sans résultat attendu : rien ne part, l’erreur le NOMME', async () => {
    onAdd.mockClear()
    const user = await openForm()
    await user.type(screen.getByPlaceholderText(/Relancer Marc/), 'Relancer le DSI')
    await user.type(screen.getByPlaceholderText(/Objectif \(obligatoire\)/), 'Obtenir un rendez-vous')
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeDisabled()
    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Le résultat attendu est obligatoire')
  })

  it('objectif et résultat attendu fournis : l’action part avec les deux', async () => {
    onAdd.mockClear()
    const user = await openForm()
    await user.type(screen.getByPlaceholderText(/Relancer Marc/), 'Relancer le DSI')
    await user.type(screen.getByPlaceholderText(/Objectif \(obligatoire\)/), 'Obtenir un rendez-vous')
    await user.type(screen.getByPlaceholderText(/Résultat attendu \(obligatoire\)/), 'Un rendez-vous fixé')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Relancer le DSI' }),
      'Obtenir un rendez-vous',
      'Un rendez-vous fixé',
    )
  })
})
