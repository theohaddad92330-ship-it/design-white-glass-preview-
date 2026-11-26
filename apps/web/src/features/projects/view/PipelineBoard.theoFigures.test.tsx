import { pipelineSummary } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to ?? '#'}>{children}</a>,
}))

const { PipelineSummaryLine } = await import('./PipelineSummaryLine')

// V22 `.bo11-summary` (#4499) — « 8 affaires dans cette vue · 362 000 € pipe ouvert HT · estimation non pondérée » :
// une ligne, plus quatre cartes ; un montant jamais chiffré reste NOMMÉ, jamais 0.
const rows = (amounts: (number | null)[]) =>
  amounts.map(amount_cents => ({ stage: 'qualified', amount_cents, has_next_action: true }))

describe('PipelineSummaryLine — N affaires dans cette vue · X € pipe ouvert HT · estimation non pondérée', () => {
  it('dit le nombre de la VUE, le montant, son libellé et « estimation non pondérée », dans cet ordre', () => {
    render(<PipelineSummaryLine summary={pipelineSummary(rows([10_000_00, 20_000_00]))} count={8} />)
    const line = screen.getByTestId('pipeline-summary')
    const text = (line.textContent ?? '').replace(/\s+/g, ' ')
    // Arbitrage Louis 24/10 : la synthèse est rendue par `KeyFigureRow` — le libellé d'une tuile précède son chiffre.
    expect(screen.getByTestId('pipeline-in-view')).toHaveAccessibleName('affaires actives : 8')
    expect(text).toMatch(/pipe ouvert HT.*30\s?000\s?€.*estimation non pondérée/)
    expect(text.indexOf('actives')).toBeLessThan(text.indexOf('pipe ouvert HT'))
  })

  it('un pipe partiellement chiffré garde son montant et « estimation non pondérée » (le plancher se dit par le slot)', () => {
    render(
      <PipelineSummaryLine
        summary={pipelineSummary(rows([10_000_00, null]))}
        count={2}
        withoutAmountSlot={<span>1 affaire sans montant, hors total</span>}
      />,
    )
    expect(screen.getByText(/estimation non pondérée/i)).toBeInTheDocument()
    expect(screen.getByTestId('pipeline-total')).toHaveTextContent('1 affaire sans montant, hors total')
  })

  it('jamais 0 € : un pipe sans aucun montant reste « non mesuré », sans « estimation »', () => {
    render(<PipelineSummaryLine summary={pipelineSummary(rows([null, null]))} count={2} />)
    expect(screen.queryByText(/0\s?€/)).toBeNull()
    expect(screen.getByText(/non mesuré/i)).toBeInTheDocument()
    expect(screen.queryByText(/estimation non pondérée/i)).toBeNull()
  })

  it('aucune affaire dans la vue : « Aucune affaire dans cette vue », jamais « 0 affaire »', () => {
    render(<PipelineSummaryLine summary={pipelineSummary(rows([10_000_00]))} count={0} />)
    expect(screen.getByText('Aucune affaire dans cette vue')).toBeInTheDocument()
    expect(screen.queryByTestId('pipeline-in-view')).toBeNull()
    expect(screen.queryByText(/^0 affaire/)).toBeNull()
  })

  it('NON : aucune probabilité, aucun pondéré, aucune carte d’indicateur', () => {
    render(<PipelineSummaryLine summary={pipelineSummary(rows([10_000_00]))} count={1} />)
    const text = screen.getByTestId('pipeline-summary').textContent ?? ''
    expect(text).not.toMatch(/probab|pondéré |%/i)
    expect(screen.queryByTestId('pipeline-kpis')).toBeNull()
  })
})
