import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { emptyNeedFilters } from '@bellum/contracts'
import { NeedsFilterDrawer } from './NeedsFilterDrawer'

/**
 * #3409.1bis — les options d'urgence et de type de contrat du tiroir
 * lisaient `needUrgency.*` / `contractKind.*`, deux préfixes qui n'existent
 * dans aucun des deux fichiers de langue (les vraies clés vivent sous
 * `openNeeds.urgency.*` / `openNeeds.contract.*`, celles que
 * `enum-keys.test.ts` couvre). Le `t(key, value)` retombait sur la valeur
 * BRUTE de l'enum (« basse », « regie ») — d'où les warnings console
 * `[i18n] clé manquante` du rapport de bug #3409, et un filtre affiché en
 * anglais technique plutôt qu'en français.
 */
vi.mock('./SavedNeedViews', () => ({ SavedNeedViews: () => null }))

describe('NeedsFilterDrawer — traduction des options urgence/contrat', () => {
  it('affiche les libellés FR réels, pas les clés enum brutes', async () => {
    const user = userEvent.setup()
    render(
      <NeedsFilterDrawer open onOpenChange={() => {}} filters={emptyNeedFilters()} searchTerm="" onApply={() => {}} />,
    )

    // Ordre du formulaire : urgence (0), statut (1), type de contrat (2), source (3).
    const comboboxes = screen.getAllByRole('combobox')

    await user.click(comboboxes[0])
    expect(await screen.findByRole('option', { name: 'Basse' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Critique' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'basse' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(comboboxes[2])
    expect(await screen.findByRole('option', { name: 'Régie' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Recrutement' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'regie' })).not.toBeInTheDocument()
  })
})

describe('NeedsFilterDrawer — Théo C projects-besoins.R3', () => {
  it('« Statut » offre les trois statuts affichés, l’état précis est un autre champ', async () => {
    const user = userEvent.setup()
    render(
      <NeedsFilterDrawer open onOpenChange={() => {}} filters={emptyNeedFilters()} searchTerm="" onApply={() => {}} />,
    )
    await user.click(screen.getAllByRole('combobox')[1])
    expect(await screen.findByRole('option', { name: 'À qualifier' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Ouvert' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Couvert' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Matching en cours' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.getByText('Étiquette (état précis)')).toBeInTheDocument()
  })
})
