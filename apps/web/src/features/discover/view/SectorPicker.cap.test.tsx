import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { APPLICATION_SECTORS } from '@bellum/contracts'
import { SectorPicker } from './SectorPicker'

/**
 * #3528 (Louis 01/10) — « limiter la recherche à 5 secteurs/sous-secteurs
 * maxi pour avoir une recherche plus fine ».
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'count' in options ? `${key}:${String(options.count)}/${String(options.max)}` : key,
    i18n: { language: 'fr' },
  }),
}))

// Cinq codes réels du vocabulaire partagé : le plafond est atteint.
const FIVE = APPLICATION_SECTORS.slice(0, 5).map(sector => sector.code)

describe('#3528 — SectorPicker : 5 secteurs maximum', () => {
  it('annonce le compte « n/5 » dès qu’un secteur est choisi, jamais « 0/5 » à vide', () => {
    const { rerender } = render(<SectorPicker selected={[]} onChange={() => {}} />)
    expect(screen.queryByTestId('sector-cap-counter')).not.toBeInTheDocument()
    rerender(<SectorPicker selected={FIVE.slice(0, 2)} onChange={() => {}} />)
    expect(screen.getByTestId('sector-cap-counter')).toHaveTextContent('rail.sectorCapCounter:2/5')
  })

  // #3815.3 — à 5/5, l'ajout est DÉSACTIVÉ avant le clic (aria-disabled +
  // raison en `title`), plutôt qu'un clic qui part puis se fait refuser.
  it('⚠️ SAIT DIRE NON — à 5/5, les cases non cochées sont désactivées, la raison visible AVANT le clic', () => {
    const onChange = vi.fn()
    render(<SectorPicker selected={FIVE} onChange={onChange} />)
    // Ouvre un groupe contenant un secteur non choisi (la recherche déplie).
    fireEvent.change(screen.getByLabelText('rail.sectorSearchLabel'), { target: { value: 'e' } })
    const candidates = screen
      .getAllByRole('button')
      // Un `ToggleChip` (secteur ou groupe) porte toujours `aria-pressed` —
      // le chevron de dépli et les pastilles « retirer » n'en portent pas.
      .filter(button => button.getAttribute('aria-pressed') === 'false')
    expect(candidates.length).toBeGreaterThan(0)
    for (const button of candidates) {
      expect(button).toHaveAttribute('aria-disabled', 'true')
      expect(button).toHaveAttribute('title', 'rail.sectorCapHint')
    }
    // Cliquer chaque pastille désactivée : aucune ne doit ajouter un 6e secteur.
    for (const button of candidates) fireEvent.click(button)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('retirer un secteur reste permis à 5/5 — seul l’ajout est désactivé', () => {
    const onChange = vi.fn()
    render(<SectorPicker selected={FIVE} onChange={onChange} />)
    const removeButton = screen.getAllByText('rail.sectorRemove')[0].closest('button') as HTMLElement
    expect(removeButton).not.toHaveAttribute('aria-disabled')
    fireEvent.click(removeButton)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect((onChange.mock.calls[0][0] as string[]).length).toBe(4)
  })

  it('un groupe pas encore complet, sans place restante, est désactivé lui aussi', () => {
    const onChange = vi.fn()
    render(<SectorPicker selected={FIVE} onChange={onChange} />)
    const groupChips = screen.getAllByRole('button').filter(b => b.getAttribute('aria-pressed') !== null)
    expect(groupChips.length).toBeGreaterThan(0)
    for (const chip of groupChips) {
      expect(chip).toHaveAttribute('aria-disabled', 'true')
      fireEvent.click(chip)
    }
    expect(onChange).not.toHaveBeenCalled()
  })
})

// #3815 — « clic sur secteur refusé alors que le compteur affiche 3/5 » :
// cocher un groupe plus grand que la place restante AJOUTE ce qui tient et
// NOMME ce qui n'a pas tenu, au lieu d'un refus muet en bloc.
describe('#3815 — SectorPicker : un groupe ajoute ce qui tient, nomme le reste', () => {
  it('à 3/5, cocher un groupe de 8 ajoute les 2 qui tiennent et nomme les 6 qui ne tiennent pas', () => {
    const onChange = vi.fn()
    const current = ['rail', 'renewables', 'nuclear'] // 3/5, hors du groupe « industrie »
    render(<SectorPicker selected={current} onChange={onChange} />)
    // « Industrie » est le premier groupe du vocabulaire partagé (8 secteurs).
    const industrieChip = screen.getByText('common:sectorGroups.industrie').closest('button') as HTMLElement
    expect(industrieChip).not.toHaveAttribute('aria-disabled')
    fireEvent.click(industrieChip)
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as string[]
    expect(next).toHaveLength(5)
    expect(screen.getByTestId('sector-group-cap-hint')).toHaveTextContent('rail.sectorGroupCapHint:6/5')
  })
})
