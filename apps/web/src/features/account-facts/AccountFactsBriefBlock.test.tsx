import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AccountFactsBrief } from '@bellum/contracts'
import { AccountFactsBriefBlock } from './AccountFactsBriefBlock'

const BRIEF: AccountFactsBrief = {
  asOf: '2026-10-12T08:00:00.000Z',
  deals: [
    { date: '2025-06-01', kind: 'deal_lost', label: 'Refonte portail' },
    { date: '2025-01-10', kind: 'deal_won', label: 'TMA SI RH' },
  ],
  missions: [{ date: '2024-01-08', kind: 'mission', label: 'Architecte data' }],
  recurringNeeds: [{ label: 'Développeur Java', occurrences: 3, lastDate: '2026-03-01' }],
  exchanges: [{ date: '2026-09-02', kind: 'exchange', label: 'E-mail envoyé à Jeanne — « Point TMA »' }],
}

// #4072.3
describe('AccountFactsBriefBlock — la fiche de préparation du RDV', () => {
  it('rend les quatre rubriques, chaque fait daté (un ancien reste daté)', () => {
    render(<AccountFactsBriefBlock brief={BRIEF} />)
    for (const name of [/affaires passées/i, /missions/i, /besoins récurrents/i, /derniers échanges/i]) {
      expect(screen.getByRole('heading', { name })).toBeTruthy()
    }
    const deals = screen.getByRole('region', { name: /affaires passées/i })
    expect(within(deals).getAllByRole('listitem')).toHaveLength(2)
    expect(deals.textContent).toMatch(/2025/)
    expect(screen.getByText(/E-mail envoyé à Jeanne/)).toBeTruthy()
  })

  it('un besoin récurrent dit combien de fois et depuis quand', () => {
    render(<AccountFactsBriefBlock brief={BRIEF} />)
    const needs = screen.getByRole('region', { name: /besoins récurrents/i })
    expect(needs.textContent).toMatch(/Développeur Java/)
    expect(needs.textContent).toMatch(/3/)
    expect(needs.textContent).toMatch(/2026/)
  })

  it('une rubrique sans fait ne fait aucune ligne ; sans aucun fait, rien du tout', () => {
    render(<AccountFactsBriefBlock brief={{ ...BRIEF, deals: [], missions: [], recurringNeeds: [] }} />)
    expect(screen.queryByRole('heading', { name: /affaires passées/i })).toBeNull()
    expect(screen.queryByRole('heading', { name: /missions/i })).toBeNull()
    expect(screen.getByRole('heading', { name: /derniers échanges/i })).toBeTruthy()
    const empty = render(
      <AccountFactsBriefBlock brief={{ ...BRIEF, deals: [], missions: [], recurringNeeds: [], exchanges: [] }} />,
    )
    expect(empty.container.querySelector('section')).toBeNull()
  })
})
