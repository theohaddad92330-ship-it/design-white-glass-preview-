import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NeedOwnerSuggestion, needOwnerSuggestion } from './NeedOwnerSuggestion'

/**
 * #4016.L4 — « valeurs suggérées à la saisie » : le porteur du projet de rattachement est PROPOSÉ comme
 * propriétaire du besoin, badgé « suggéré », appliqué seulement sur un clic — jamais un défaut (c42).
 */
const OWNERS = [
  { id: 'u-1', name: 'Claire Martin' },
  { id: 'u-2', name: 'Hugo Petit' },
]

describe('needOwnerSuggestion', () => {
  it('propose le porteur du projet quand il est membre et que rien n’est choisi', () => {
    expect(needOwnerSuggestion({ projectOwnerId: 'u-2', owners: OWNERS, currentOwnerId: '' })).toEqual(OWNERS[1])
  })

  it('sait dire NON : aucun projet porté, porteur hors des membres, ou déjà choisi', () => {
    expect(needOwnerSuggestion({ projectOwnerId: null, owners: OWNERS, currentOwnerId: '' })).toBeNull()
    expect(needOwnerSuggestion({ projectOwnerId: 'u-9', owners: OWNERS, currentOwnerId: '' })).toBeNull()
    expect(needOwnerSuggestion({ projectOwnerId: 'u-2', owners: OWNERS, currentOwnerId: 'u-1' })).toBeNull()
  })
})

describe('NeedOwnerSuggestion', () => {
  it('badgée « suggéré » avec sa base ; le clic applique, rien sans clic', async () => {
    const onApply = vi.fn()
    render(<NeedOwnerSuggestion owner={OWNERS[1]} onApply={onApply} />)
    expect(screen.getByRole('note', { name: /suggéré.*porteur du projet/ })).toBeInTheDocument()
    expect(onApply).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /Hugo Petit/ }))
    expect(onApply).toHaveBeenCalledWith('u-2')
  })
})
