import type { AccountListItem, CompanySuggestion } from '@bellum/contracts'
import { fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { CompanySearchBox } from './CompanySearchBox'

const rhone: CompanySuggestion = {
  name: 'Rhône-Alpes Logistique',
  siren: '412087553',
  city: 'Vénissieux',
  sector: 'Transport',
  headcount_label: '250 à 499 salariés',
}
const cessee: CompanySuggestion = {
  name: 'Rhône Mutuelle',
  siren: '100200300',
  city: 'Lyon',
  sector: 'Assurance',
  is_active: false,
}

async function renderBox(overrides: Partial<Parameters<typeof CompanySearchBox>[0]> = {}) {
  const props = {
    query: 'Rhône',
    onQueryChange: vi.fn(),
    onSubmit: vi.fn(),
    suggestions: [rhone, cessee],
    suggestionsLoading: false,
    showDropdown: true,
    onShowDropdown: vi.fn(),
    onSelectSuggestion: vi.fn(),
    country: 'FR' as const,
    onCountryChange: vi.fn(),
    portfolioMatches: [] as AccountListItem[],
    onAddToPortfolio: vi.fn(),
    ...overrides,
  }
  renderWithRouter(<CompanySearchBox {...props} />)
  await screen.findByRole('combobox', { name: 'Entreprise à analyser' })
  return props
}

describe('CompanySearchBox — la recherche d’entreprise (refonte Théo R1)', () => {
  beforeAll(() => {
    window.scrollTo = vi.fn()
  })
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('range les résultats : « Dans ton portefeuille » d’abord, puis « Registre des entreprises »', async () => {
    await renderBox({
      portfolioMatches: [
        { id: 'a1', company_name: 'Rhône Prévoyance', siren: '999888777', sector: 'Assurance' } as AccountListItem,
      ],
    })
    const labels = screen.getAllByRole('presentation').map(node => node.textContent)
    expect(labels).toEqual(['Dans ton portefeuille', 'Registre des entreprises'])
  })

  it('réponses en deux temps : le portefeuille arrivé après le registre s’insère SOUS lui, l’ordre au-dessus ne bouge pas', async () => {
    const props = {
      query: 'Rhône',
      onQueryChange: vi.fn(),
      onSubmit: vi.fn(),
      suggestions: [rhone, cessee],
      suggestionsLoading: false,
      showDropdown: true,
      onShowDropdown: vi.fn(),
      onSelectSuggestion: vi.fn(),
      country: 'FR' as const,
      onCountryChange: vi.fn(),
      portfolioMatches: [] as AccountListItem[],
    }
    function Harness() {
      const [matches, setMatches] = useState<AccountListItem[]>([])
      return (
        <>
          <button type="button" onClick={() => setMatches([account])}>
            arrive
          </button>
          <CompanySearchBox {...props} portfolioMatches={matches} />
        </>
      )
    }
    const account = {
      id: 'a1',
      company_name: 'Rhône Prévoyance',
      siren: '999888777',
      sector: 'Assurance',
    } as AccountListItem
    renderWithRouter(<Harness />)
    await screen.findByRole('combobox', { name: 'Entreprise à analyser' })
    const names = () => screen.getAllByRole('option').map(node => node.getAttribute('aria-label'))
    const before = names()
    fireEvent.click(screen.getByRole('button', { name: 'arrive' }))
    expect(names().slice(0, before.length)).toEqual(before)
    expect(names()).toEqual([...before, 'Rhône Prévoyance'])
  })

  it('sans compte dans l’espace, aucun groupe « portefeuille » vide', async () => {
    await renderBox()
    expect(screen.queryByText('Dans ton portefeuille')).not.toBeInTheDocument()
  })

  it('une ligne dit ce qui DIFFÉRENCIE deux homonymes, et marque — sans la masquer — une entité cessée', async () => {
    await renderBox()
    expect(screen.getByText(/Vénissieux · Transport · 250 à 499 salariés · 412087553/)).toBeInTheDocument()
    expect(screen.getByText('Entreprise cessée')).toBeInTheDocument()
  })

  it('choisir une ligne remonte l’entreprise ; « Ajouter au portefeuille » ne la choisit PAS', async () => {
    const props = await renderBox()
    fireEvent.click(screen.getByRole('option', { name: 'Rhône-Alpes Logistique' }))
    expect(props.onSelectSuggestion).toHaveBeenCalledWith(rhone)
    vi.mocked(props.onSelectSuggestion).mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter Rhône-Alpes Logistique au portefeuille' }))
    expect(props.onAddToPortfolio).toHaveBeenCalledWith(rhone)
    expect(props.onSelectSuggestion).not.toHaveBeenCalled()
  })

  it('#1107 — une source muette ne se lit jamais « aucune entreprise trouvée »', async () => {
    await renderBox({ suggestions: [], sourceUnavailable: true })
    expect(screen.getByText(/La recherche d'entreprises n'a pas répondu/)).toBeInTheDocument()
    expect(screen.queryByText('Aucune entreprise trouvée.')).not.toBeInTheDocument()
  })

  it('Entrée lance la préparation, Échap ferme la liste', async () => {
    const props = await renderBox()
    const input = screen.getByRole('combobox', { name: 'Entreprise à analyser' })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(props.onShowDropdown).toHaveBeenLastCalledWith(false)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(props.onSubmit).toHaveBeenCalledTimes(1)
  })

  it('liste fermée : le champ reste, la liste disparaît', async () => {
    await renderBox({ showDropdown: false })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Entreprise à analyser' })).toHaveAttribute('aria-expanded', 'false')
  })
})
