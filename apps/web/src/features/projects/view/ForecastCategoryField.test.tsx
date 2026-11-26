import type { ProjectRow } from '@bellum/contracts'
import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * La catégorie DÉCLARÉE sur la fiche opportunité (L2 Pipe) : quatre valeurs et
 * « Non déclarée », une déclaration (aucun pourcentage), écrite par la porte
 * partagée avec la table d'inspection.
 */
vi.mock('@bellum/ui', async importOriginal => {
  const actual = await importOriginal<typeof import('@bellum/ui')>()
  return {
    ...actual,
    // Radix ne se pilote pas en jsdom : un <select> natif porte les mêmes options.
    SelectField: ({
      value,
      onChange,
      options,
      emptyOption,
      ariaLabel,
    }: {
      value: string
      onChange: (next: string) => void
      options: readonly { value: string; label: string }[]
      emptyOption?: { label: string }
      ariaLabel?: string
    }) => (
      <select aria-label={ariaLabel} value={value} onChange={event => onChange(event.target.value)}>
        {emptyOption ? <option value="">{emptyOption.label}</option> : null}
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
  }
})
const mutate = vi.fn()
vi.mock('../hooks/useUpdateProjectForecast', () => ({
  useUpdateForecastCategory: () => ({ mutate, isPending: false, isError: false }),
}))

const { ProjectForecastCategoryControl } = await import('./ForecastCategoryField')

const opportunity = { id: '11111111-1111-4111-8111-111111111111', forecast_category: null } as ProjectRow

beforeEach(() => vi.clearAllMocks())

describe('ProjectForecastCategoryControl', () => {
  it('propose les quatre catégories et « Non déclarée », sans pourcentage', async () => {
    const { container } = renderWithRouter(<ProjectForecastCategoryControl opportunity={opportunity} />)
    const select = (await screen.findByRole('combobox', { name: 'Catégorie déclarée' })) as HTMLSelectElement
    expect([...select.options].map(option => option.textContent)).toEqual([
      'Non déclarée',
      'Engagé',
      'Possible',
      'Pipe',
      'Hors prévision',
    ])
    expect(select.value).toBe('')
    expect(container.textContent).toContain('sans pourcentage associé')
  })

  it('déclarer écrit la catégorie ; revenir à « Non déclarée » écrit null', async () => {
    renderWithRouter(<ProjectForecastCategoryControl opportunity={{ ...opportunity, forecast_category: 'commit' }} />)
    const select = await screen.findByRole('combobox', { name: 'Catégorie déclarée' })
    expect((select as HTMLSelectElement).value).toBe('commit')
    fireEvent.change(select, { target: { value: 'omitted' } })
    expect(mutate).toHaveBeenLastCalledWith({ id: opportunity.id, category: 'omitted' })
    fireEvent.change(select, { target: { value: '' } })
    expect(mutate).toHaveBeenLastCalledWith({ id: opportunity.id, category: null })
  })
})
