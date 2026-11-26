import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ContactLevelField } from './ContactLevelField'

// #2163.25-30 — Terrain / Manager / Direction locale / Achats / Direction
// groupe, plus « Tous, avec priorisation » (#2163.30) : pas une 6e valeur,
// c'est ce que fait déjà la sélection de plusieurs niveaux DANS L'ORDRE choisi.
describe('ContactLevelField (#2163.25-30)', () => {
  it('affiche les 5 niveaux de contact', () => {
    render(<ContactLevelField value={[]} onChange={vi.fn()} />)
    for (const label of ['Terrain', 'Manager', 'Direction locale', 'Achats', 'Direction groupe']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument()
    }
  })

  it('un clic AJOUTE le niveau, à la fin de la liste — l’ordre porte la priorité', () => {
    const onChange = vi.fn()
    render(<ContactLevelField value={['operational']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Manager/ }))
    expect(onChange).toHaveBeenCalledWith(['operational', 'n2'])
  })

  it('un clic sur un niveau déjà choisi le RETIRE', () => {
    const onChange = vi.fn()
    render(<ContactLevelField value={['operational', 'n2']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Terrain/ }))
    expect(onChange).toHaveBeenCalledWith(['n2'])
  })

  it('numérote les niveaux choisis pour montrer l’ordre de priorité (#2163.30)', () => {
    render(<ContactLevelField value={['n1', 'c_level']} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Direction locale.*1/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Direction groupe.*2/ })).toBeInTheDocument()
  })

  it('ne montre aucun ordre quand rien n’est choisi ou qu’un seul niveau l’est', () => {
    render(<ContactLevelField value={['n1']} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Direction locale' })).toBeInTheDocument()
  })
})
