import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const team = vi.hoisted(() => ({ role: 'admin' as string | null }))

vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: team.role ? { workspace: { role: team.role } } : undefined }),
}))
// Les contenus portent leurs propres tests : ici on mesure la COQUE (onglets, droits, adresse).
vi.mock('./MyDataView', () => ({ MyDataView: () => <p>contenu-exports</p> }))
vi.mock('./VivierExportCard', () => ({ VivierExportCard: () => <p>carte-vivier</p> }))
vi.mock('@/features/import/view/ImportsPanel', () => ({ ImportsPanel: () => <p>contenu-imports</p> }))

const { MyDataTabs } = await import('./MyDataTabs')

afterEach(() => {
  cleanup()
  team.role = 'admin'
})

/**
 * #4533.1/.4 + #4532.1 — « Mes données » : Exports · Imports. Imports est réservé aux gestionnaires
 * (`team:manage`, la règle de `managerOnly`) ; un membre ne le voit pas, même par `?tab=imports`.
 */
describe('MyDataTabs — droits de l’onglet Imports', () => {
  it('gestionnaire : deux onglets, Exports par défaut, la carte vivier avec Exports', () => {
    render(<MyDataTabs tab="exports" onTabChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Exports', selected: true })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Imports' })).toBeInTheDocument()
    expect(screen.getByText('contenu-exports')).toBeInTheDocument()
    expect(screen.getByText('carte-vivier')).toBeInTheDocument()
    expect(screen.queryByText('contenu-imports')).not.toBeInTheDocument()
  })

  it('gestionnaire : ?tab=imports montre Imports, et la carte vivier N’Y EST PAS (une seule fois, GA-26)', () => {
    render(<MyDataTabs tab="imports" onTabChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Imports', selected: true })).toBeInTheDocument()
    expect(screen.getByText('contenu-imports')).toBeInTheDocument()
    expect(screen.queryByText('carte-vivier')).not.toBeInTheDocument()
  })

  it('REFUS — membre : pas d’onglet Imports', () => {
    team.role = 'member'
    render(<MyDataTabs tab="exports" onTabChange={vi.fn()} />)
    expect(screen.queryByRole('tab', { name: 'Imports' })).not.toBeInTheDocument()
    expect(screen.getByText('contenu-exports')).toBeInTheDocument()
  })

  it('REFUS — membre + ?tab=imports : atterrit sur Exports, le contenu d’Imports n’est jamais monté', () => {
    team.role = 'member'
    render(<MyDataTabs tab="imports" onTabChange={vi.fn()} />)
    expect(screen.getByText('contenu-exports')).toBeInTheDocument()
    expect(screen.queryByText('contenu-imports')).not.toBeInTheDocument()
  })

  it('REFUS — rôle encore inconnu (équipe non chargée) : jamais Imports sur un doute', () => {
    team.role = null
    render(<MyDataTabs tab="imports" onTabChange={vi.fn()} />)
    expect(screen.queryByText('contenu-imports')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Imports' })).not.toBeInTheDocument()
  })

  it('un clic sur un onglet demande sa clé — l’adresse décide', async () => {
    const onTabChange = vi.fn()
    render(<MyDataTabs tab="exports" onTabChange={onTabChange} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Imports' }))
    expect(onTabChange).toHaveBeenCalledWith('imports')
  })
})

/** #4605.2/.4 — UNE largeur de contenu pour les deux onglets, posée UNE fois par la coque (jamais par contenu). */
describe('MyDataTabs — les deux onglets rendent la même largeur de contenu', () => {
  const bound = () => screen.getByTestId('my-data-content')

  it('Exports : le contenu (liste ET carte vivier) vit dans la colonne bornée', () => {
    render(<MyDataTabs tab="exports" onTabChange={vi.fn()} />)
    expect(bound()).toHaveClass('w-full', 'max-w-5xl')
    expect(bound()).toContainElement(screen.getByText('carte-vivier'))
    expect(bound()).toContainElement(screen.getByText('contenu-exports'))
  })

  it('Imports : la MÊME colonne — pas de bascule de gabarit entre les onglets', () => {
    render(<MyDataTabs tab="imports" onTabChange={vi.fn()} />)
    expect(bound()).toHaveClass('w-full', 'max-w-5xl')
    expect(bound()).toContainElement(screen.getByText('contenu-imports'))
  })
})
