import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountJobOffers } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { AccountJobOffersPanel } from './AccountJobOffersPanel'

type QueryState = { data?: AccountJobOffers; isPending: boolean; isError: boolean; isFetching: boolean }

const state: { calls: (string | null)[]; result: QueryState } = {
  calls: [],
  result: { isPending: true, isError: false, isFetching: false },
}

vi.mock('@/features/accounts/hooks/useAccountJobOffers', () => ({
  useAccountJobOffers: (_id: string, term: string | null) => {
    state.calls.push(term)
    return term === null ? { isPending: true, isError: false, isFetching: false } : state.result
  },
}))

const offers = (n: number): AccountJobOffers['offers'] =>
  Array.from({ length: n }, (_, i) => ({
    title: `Data Engineer ${i + 1}`,
    employer: 'DECATHLON',
    city: 'Lille',
    url: `https://o/${i}`,
    publishedAt: '2026-10-20',
    contractType: 'CDI',
    origin: null,
  }))

function search(term: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Métier à chercher' }), { target: { value: term } })
  fireEvent.click(screen.getByRole('button', { name: /Chercher/ }))
}

// Louis 30/10 — chercher un autre métier sur un compte, afficher les offres 5 par 5 jusqu'à 50.
describe('AccountJobOffersPanel', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('fr')
  })
  beforeEach(() => {
    state.calls = []
    state.result = { isPending: true, isError: false, isFetching: false }
  })

  it('ne cherche rien avant le geste', () => {
    render(<AccountJobOffersPanel accountId="a1" />)
    expect(state.calls.every(t => t === null)).toBe(true)
    expect(screen.queryByTestId('account-job-offers-list')).toBeNull()
  })

  it('cherche le métier saisi puis déroule les offres 5 par 5', () => {
    state.result = {
      data: { term: 'data engineer', searched: true, offers: offers(12) },
      isPending: false,
      isError: false,
      isFetching: false,
    }
    render(<AccountJobOffersPanel accountId="a1" />)
    search('  data   engineer ')
    expect(state.calls).toContain('data engineer')
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    fireEvent.click(screen.getByTestId('account-job-offers-more'))
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
    expect(screen.getByTestId('account-job-offers-more')).toHaveTextContent('Afficher 2 de plus')
    fireEvent.click(screen.getByTestId('account-job-offers-more'))
    expect(screen.getAllByRole('listitem')).toHaveLength(12)
    expect(screen.queryByTestId('account-job-offers-more')).toBeNull()
    expect(screen.queryByTestId('account-job-offers-cap')).toBeNull()
  })

  it('dit la limite de 50 une fois tout déroulé', () => {
    state.result = {
      data: { term: '', searched: true, offers: offers(50) },
      isPending: false,
      isError: false,
      isFetching: false,
    }
    render(<AccountJobOffersPanel accountId="a1" />)
    search('')
    for (let i = 0; i < 9; i += 1) fireEvent.click(screen.getByTestId('account-job-offers-more'))
    expect(screen.getAllByRole('listitem')).toHaveLength(50)
    expect(screen.getByTestId('account-job-offers-cap')).toHaveTextContent('Limite de 50 offres atteinte.')
  })

  it('une recherche qui n’a pas pu partir ne se lit jamais « aucune offre »', () => {
    state.result = {
      data: { term: 'data', searched: false, offers: [] },
      isPending: false,
      isError: false,
      isFetching: false,
    }
    render(<AccountJobOffersPanel accountId="a1" />)
    search('data')
    expect(screen.getByTestId('account-job-offers-unsearched')).toBeInTheDocument()
    expect(screen.queryByTestId('account-job-offers-empty')).toBeNull()
  })

  it('aucune offre pour le métier : le dit en nommant le métier', () => {
    state.result = {
      data: { term: 'notaire', searched: true, offers: [] },
      isPending: false,
      isError: false,
      isFetching: false,
    }
    render(<AccountJobOffersPanel accountId="a1" />)
    search('notaire')
    expect(screen.getByTestId('account-job-offers-empty')).toHaveTextContent('« notaire »')
  })

  // #5000.1 / #5010.1 — chaque ligne dit son type de contrat (« non précisé » sinon) et son site d'origine.
  it('chaque ligne porte le type de contrat et le site d’origine', () => {
    const rows = offers(3)
    rows[1] = { ...rows[1]!, contractType: 'freelance' as const, origin: 'LinkedIn' }
    rows[2] = { ...rows[2]!, contractType: 'non précisé' as const, origin: null }
    state.result = {
      data: { term: '', searched: true, offers: rows },
      isPending: false,
      isError: false,
      isFetching: false,
    }
    render(<AccountJobOffersPanel accountId="a1" />)
    search('data')
    const lines = screen.getAllByRole('listitem').map(li => li.textContent ?? '')
    expect(lines[0]).toContain('CDI')
    expect(lines[1]).toContain('Freelance')
    expect(lines[1]).toContain('LinkedIn')
    expect(lines[2]).toContain('Contrat non précisé')
    expect(lines[2]).not.toContain('LinkedIn')
    expect(lines[0]).not.toContain('Indeed')
  })
})
