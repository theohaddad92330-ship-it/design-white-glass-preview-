import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OnboardingSectorProposal } from './OnboardingSectorProposal'

// #4973 — proposés, jamais cochés d'office ; un espace sans secteurs d'onboarding ne voit rien.
describe('OnboardingSectorProposal (#4973)', () => {
  it('propose les secteurs onboardés, aucun n’est coché ; un clic en ajoute un', async () => {
    const onAdd = vi.fn()
    render(<OnboardingSectorProposal proposed={['rail', 'defense']} selected={[]} onAdd={onAdd} />)
    const chips = screen.getAllByRole('button')
    expect(chips).toHaveLength(2)
    chips.forEach(chip => expect(chip).not.toHaveAttribute('aria-pressed', 'true'))
    await userEvent.click(chips[0] as HTMLElement)
    expect(onAdd).toHaveBeenCalledWith('rail')
  })
  it('sans secteur d’onboarding, ou tous déjà posés : rien de rendu', () => {
    const { container, rerender } = render(<OnboardingSectorProposal proposed={[]} selected={[]} onAdd={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<OnboardingSectorProposal proposed={['rail']} selected={['rail']} onAdd={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
