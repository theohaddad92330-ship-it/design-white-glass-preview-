import type { Account } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TabFinance } from './TabFinance'

function account(raw: Record<string, unknown>): Account {
  return { id: 'acc-1', raw_analysis: raw } as unknown as Account
}

describe('TabFinance', () => {
  it('rend les exercices datés avec leur marge — celle du compte analysé', () => {
    render(
      <TabFinance
        account={account({
          financials_history: [
            {
              year: 2023,
              closing_date: '2023-12-31',
              revenue: 1_000_000,
              gross_margin: 400_000,
              ebitda: 90_000,
              operating_result: 70_000,
            },
          ],
        })}
      />,
    )
    expect(screen.getByText(/Exercice 2023/)).toBeInTheDocument()
    expect(screen.getByText(/31 déc/)).toBeInTheDocument()
    expect(screen.getByText(/40\s?%/)).toBeInTheDocument()
    expect(screen.getByText(/marge de ce compte, pas la tienne/i)).toBeInTheDocument()
  })

  it('nomme « Non publié » ce qui manque, sans jamais écrire 0', () => {
    render(<TabFinance account={account({ financials_history: [{ year: 2022, revenue: 900 }] })} />)
    expect(screen.getAllByText('Non publié').length).toBeGreaterThanOrEqual(3)
    expect(screen.queryByText(/^0(\s?€)?$/)).toBeNull()
  })

  it('sans aucun exercice, dit ce qui manque et pourquoi — jamais blanc', () => {
    render(<TabFinance account={account({})} />)
    expect(screen.getByText(/Aucun exercice publié/)).toBeInTheDocument()
    expect(screen.getByText(/pas encore publié ses comptes|n’a pas publié|ne publie pas/i)).toBeInTheDocument()
  })

  it('ne nomme jamais la source ni ne promet de probabilité', () => {
    const { container } = render(
      <TabFinance account={account({ financials_history: [{ year: 2023, gross_margin: 1 }] })} />,
    )
    expect(container.textContent).not.toMatch(/pappers|insee|probabilit|prévisionnel/i)
  })
})
