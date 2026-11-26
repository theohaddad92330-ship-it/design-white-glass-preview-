import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SituationPicker } from './SituationPicker'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

/**
 * #5027 — un commercial qui a DÉJÀ son compte en tête a un chemin direct : taper le nom, analyser.
 * Au même niveau que « je n'ai aucun compte en tête » — sans passer par Découvrir.
 */
describe('SituationPicker — #5027 compte déjà ciblé', () => {
  afterEach(() => {
    cleanup()
    navigate.mockReset()
  })

  it('analyse le compte nommé : /search?q=<nom>', () => {
    render(<SituationPicker />)
    fireEvent.change(screen.getByLabelText('situations.named.inputLabel'), { target: { value: '  EDF ' } })
    fireEvent.click(screen.getByRole('button', { name: 'situations.named.cta' }))
    expect(navigate).toHaveBeenCalledWith({ to: '/search', search: { q: 'EDF' } })
  })

  it('un nom vide ne navigue pas et le bouton est inactif', () => {
    render(<SituationPicker />)
    const cta = screen.getByRole('button', { name: 'situations.named.cta' })
    expect(cta).toBeDisabled()
    fireEvent.click(cta)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('« je n’ai aucun compte en tête » reste proposé, vers Découvrir', () => {
    render(<SituationPicker />)
    fireEvent.click(screen.getByText('situations.starting.label'))
    expect(navigate).toHaveBeenCalledWith({ to: '/discover', search: { sort: 'addressability' } })
  })

  it('#5027.2 — le PROFIL demandé voyage aussi : preset « pousser une offre », champ `offer` prérempli', () => {
    render(<SituationPicker />)
    fireEvent.change(screen.getByLabelText('situations.named.inputLabel'), { target: { value: 'EDF' } })
    fireEvent.change(screen.getByLabelText('situations.named.profileLabel'), { target: { value: ' Product Owner ' } })
    fireEvent.click(screen.getByRole('button', { name: 'situations.named.cta' }))
    expect(navigate).toHaveBeenCalledWith({
      to: '/search',
      search: { q: 'EDF', preset: 'push-offer', offer: 'Product Owner' },
    })
  })

  it('#5027.2 — sans profil saisi, rien n’est posé (ni preset ni offre)', () => {
    render(<SituationPicker />)
    fireEvent.change(screen.getByLabelText('situations.named.inputLabel'), { target: { value: 'EDF' } })
    fireEvent.change(screen.getByLabelText('situations.named.profileLabel'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'situations.named.cta' }))
    expect(navigate).toHaveBeenCalledWith({ to: '/search', search: { q: 'EDF' } })
  })
})
