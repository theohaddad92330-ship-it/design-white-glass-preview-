import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_PORTFOLIO_FILTERS, type PortfolioFilterValues } from '@/features/accounts/lib/portfolioFilters'
import { AccountsFiltersDialog } from './AccountsFiltersDialog'

/**
 * #4498 (PR 12C, maquette V22 `#dlg-filters`) — « FILTRER MON PORTEFEUILLE ».
 * Le test sait dire NON : l'ordre réel des critères, la phrase qui dit ce que ces critères ne sont pas, le pied
 * Réinitialiser · Annuler · Appliquer les filtres, la MULTI-sélection (plusieurs cases par critère), « À ouvrir »
 * dans la relation, et les critères sans donnée ABSENTS.
 */

function renderDialog(
  over: Partial<{
    values: PortfolioFilterValues
    sectors: string[]
    tags: string[]
    zones: { value: string; kind: 'city' | 'department' }[]
    accessClassAvailable: boolean
    onApply: (next: PortfolioFilterValues, options: { reset: boolean }) => void
    onOpenChange: (open: boolean) => void
  }> = {},
) {
  const onApply = over.onApply ?? vi.fn()
  const onOpenChange = over.onOpenChange ?? vi.fn()
  render(
    <AccountsFiltersDialog
      open
      onOpenChange={onOpenChange}
      values={over.values ?? EMPTY_PORTFOLIO_FILTERS}
      onApply={onApply}
      sectors={over.sectors ?? ['Banque', 'Transport']}
      tags={over.tags ?? ['Cloud', 'Data']}
      zones={over.zones ?? []}
      accessClassAvailable={over.accessClassAvailable ?? true}
    />,
  )
  return { onApply, onOpenChange }
}

const MAQUETTE_ORDER = [
  'Secteur',
  'Relation commerciale',
  'État secondaire',
  'Étiquette',
  'Décision de priorité',
  'Type d’entité',
  'Fraîcheur du dossier',
  'Historique documenté',
  'Type de compte',
  'Intérêt commercial',
  'Références',
  // Hors maquette, GARDÉS dans la même grille : aucun filtre ne se perd.
  'Accessibilité',
  'Statut de l’analyse',
]

const group = (name: string) => screen.getByRole('group', { name })

describe('AccountsFiltersDialog — la modale de la maquette V22 (#4498)', () => {
  it('titre, phrase, puis les critères dans l’ordre de la maquette, aucune case cochée (= Tous)', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog', { name: 'Filtrer mon portefeuille' })
    expect(
      within(dialog).getByText(
        'Ces critères organisent les comptes de ton espace. Ils ne lancent pas une nouvelle recherche de marché.',
      ),
    ).toBeInTheDocument()
    const groups = within(dialog)
      .getAllByRole('group')
      .map(g => g.getAttribute('aria-label'))
    expect(groups).toEqual(MAQUETTE_ORDER)
    expect(within(dialog).queryAllByRole('button', { pressed: true })).toHaveLength(0)
  })

  it('« Relation commerciale » nomme À ouvrir, En ouverture, Client — dans cet ordre', () => {
    renderDialog()
    const names = within(group('Relation commerciale'))
      .getAllByRole('button')
      .map(b => b.textContent)
    expect(names).toEqual(['À ouvrir', 'En ouverture', 'Client'])
  })

  it('Historique documenté et Références autorisées sont des critères réels, plus absents', () => {
    renderDialog()
    expect(
      within(group('Historique documenté'))
        .getAllByRole('button')
        .map(b => b.textContent),
    ).toEqual(['Avec historique', 'Sans historique'])
    expect(within(group('Références')).getByRole('button', { name: 'Autorisées de mon ESN uniquement' })).toBeVisible()
    // Le responsable vit dans la barre (un réglage à un seul endroit).
    expect(screen.queryByRole('group', { name: 'Responsable' })).not.toBeInTheDocument()
  })

  it('une liste sans valeur à proposer (aucun secteur, aucune étiquette) ne s’affiche pas', () => {
    renderDialog({ sectors: [], tags: [] })
    expect(screen.queryByRole('group', { name: 'Secteur' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Étiquette' })).not.toBeInTheDocument()
  })

  it('accessibilité en panne : le critère se tait et la raison est écrite', () => {
    renderDialog({ accessClassAvailable: false })
    expect(screen.queryByRole('group', { name: 'Accessibilité' })).not.toBeInTheDocument()
    expect(screen.getByText(/Le filtre « Accessibilité » est désactivé/)).toBeInTheDocument()
  })

  it('le pied : Réinitialiser · Annuler · Appliquer les filtres, dans cet ordre', () => {
    renderDialog()
    const names = ['Réinitialiser', 'Annuler', 'Appliquer les filtres'].map(name =>
      screen.getByRole('button', { name }),
    )
    expect(Boolean(names[0]!.compareDocumentPosition(names[1]!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(Boolean(names[1]!.compareDocumentPosition(names[2]!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  })

  it('MULTI-sélection : plusieurs secteurs et plusieurs paliers sont rendus ensemble, rien ne part avant « Appliquer »', async () => {
    const user = userEvent.setup()
    const { onApply, onOpenChange } = renderDialog()
    await user.click(within(group('Secteur')).getByRole('button', { name: 'Banque' }))
    await user.click(within(group('Secteur')).getByRole('button', { name: 'Transport' }))
    await user.click(within(group('Intérêt commercial')).getByRole('button', { name: 'Élevé (≥ 7)' }))
    await user.click(within(group('Intérêt commercial')).getByRole('button', { name: 'Faible (< 5)' }))
    expect(onApply).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(onApply).toHaveBeenCalledWith(
      { ...EMPTY_PORTFOLIO_FILTERS, sector: ['Banque', 'Transport'], score: ['high', 'low'] },
      { reset: false },
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('une case cochée se décoche : la liste revient à vide (= Tous)', async () => {
    const user = userEvent.setup()
    const { onApply } = renderDialog({ values: { ...EMPTY_PORTFOLIO_FILTERS, sector: ['Banque'] } })
    expect(within(group('Secteur')).getByRole('button', { name: 'Banque' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(group('Secteur')).getByRole('button', { name: 'Banque' }))
    await user.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(onApply).toHaveBeenCalledWith(EMPTY_PORTFOLIO_FILTERS, { reset: false })
  })

  it('« À ouvrir » remplace les autres relations, et choisir une relation retire « À ouvrir »', async () => {
    const user = userEvent.setup()
    const { onApply } = renderDialog({ values: { ...EMPTY_PORTFOLIO_FILTERS, relation: ['customer'] } })
    const relation = within(group('Relation commerciale'))
    await user.click(relation.getByRole('button', { name: 'À ouvrir' }))
    expect(relation.getByRole('button', { name: 'Client' })).toHaveAttribute('aria-pressed', 'false')
    expect(relation.getByRole('button', { name: 'À ouvrir' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(relation.getByRole('button', { name: 'En ouverture' }))
    expect(relation.getByRole('button', { name: 'À ouvrir' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(onApply).toHaveBeenCalledWith({ ...EMPTY_PORTFOLIO_FILTERS, relation: ['opening'] }, { reset: false })
  })

  it('la relation et l’état secondaire se cumulent (même axe, en « ou »)', async () => {
    const user = userEvent.setup()
    const { onApply } = renderDialog({ values: { ...EMPTY_PORTFOLIO_FILTERS, secondary: ['dormant'] } })
    await user.click(within(group('Relation commerciale')).getByRole('button', { name: 'Client' }))
    expect(within(group('État secondaire')).getByRole('button', { name: 'En veille' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(onApply).toHaveBeenCalledWith(
      { ...EMPTY_PORTFOLIO_FILTERS, relation: ['customer'], secondary: ['dormant'] },
      { reset: false },
    )
  })

  it('« Réinitialiser » décoche tout, et le dit à l’application', async () => {
    const user = userEvent.setup()
    const { onApply } = renderDialog({
      values: { ...EMPTY_PORTFOLIO_FILTERS, sector: ['Banque'], gate: ['parked'], accountType: ['intermediary'] },
    })
    expect(within(group('Secteur')).getByRole('button', { name: 'Banque' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }))
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0)
    expect(onApply).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(onApply).toHaveBeenCalledWith(EMPTY_PORTFOLIO_FILTERS, { reset: true })
  })

  it('« Annuler » ferme sans rien appliquer', async () => {
    const user = userEvent.setup()
    const { onApply, onOpenChange } = renderDialog()
    await user.click(within(group('Secteur')).getByRole('button', { name: 'Transport' }))
    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onApply).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('une puce au libellé long revient à la ligne dans sa colonne au lieu de recouvrir la voisine (recette PR 12, #4498.1)', () => {
    const long = 'Activités des sièges sociaux ; conseil de gestion et ingénierie des systèmes informatiques'
    renderDialog({ sectors: [long] })
    const chip = within(group('Secteur')).getByRole('button', { name: long })
    expect(chip.className).toContain('whitespace-normal')
    expect(chip.className).toContain('max-w-full')
    expect(chip.className).not.toContain('whitespace-nowrap')
  })
})

describe('#4989 — le critère « zone » de la modale', () => {
  it('sans siège connu, le critère se tait', () => {
    renderDialog()
    expect(screen.queryByRole('group', { name: /Zone/ })).toBeNull()
    expect(screen.queryByTestId('filters-zone-note')).toBeNull()
  })

  it('avec des sièges, il propose départements et villes, DIT que le siège juge, et s’applique', async () => {
    const { onApply } = renderDialog({
      zones: [
        { value: '59', kind: 'department' },
        { value: 'Lille', kind: 'city' },
      ],
    })
    expect(screen.getByTestId('filters-zone-note')).toHaveTextContent('siège')
    await userEvent.click(within(screen.getByRole('group', { name: /Zone/ })).getByRole('button', { name: 'Lille' }))
    await userEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ zone: ['Lille'] }), { reset: false })
  })
})
