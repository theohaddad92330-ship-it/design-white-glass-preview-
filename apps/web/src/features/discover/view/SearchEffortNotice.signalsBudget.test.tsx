import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@/i18n'
import { signalsBudgetCut } from '../lib/discover-search-effort'
import { SearchEffortNotice } from './SearchEffortNotice'

// #4677.4 (recette prod 01/11, PARTIAL) — le budget de temps des signaux n'était nommé que dans le code
// (`_signals_deadline`) : quand il coupe, l'écran le DIT, en mots simples, sans chiffre de coût (crédits implicites).
describe('#4677.4 — le budget des signaux est nommé quand il coupe', () => {
  it('signalsBudgetCut lit l’entrée « discover-signals » en délai — et SAIT DIRE NON aux autres', () => {
    expect(signalsBudgetCut([{ source: 'discover-signals', reason: 'time_budget', count: 8 }])).toBe(8)
    expect(signalsBudgetCut([{ source: 'discover-signals', reason: 'network_error' }])).toBeUndefined()
    expect(signalsBudgetCut([{ source: 'bodacc', reason: 'time_budget', count: 3 }])).toBeUndefined()
    expect(signalsBudgetCut([{ source: 'discover-signals', reason: 'time_budget' }])).toBeUndefined()
    expect(signalsBudgetCut([])).toBeUndefined()
    expect(signalsBudgetCut(undefined)).toBeUndefined()
  })

  it('dit en toutes lettres que les signaux de N entreprises ont été coupés par le temps imparti', () => {
    render(<SearchEffortNotice effort={undefined} signalsCut={8} />)
    const line = screen.getByTestId('signals-budget')
    expect(line).toHaveTextContent('Les signaux de 8 entreprises')
    expect(line).toHaveTextContent('temps imparti')
  })

  it('accorde le singulier', () => {
    render(<SearchEffortNotice effort={undefined} signalsCut={1} />)
    expect(screen.getByTestId('signals-budget')).toHaveTextContent('Les signaux de 1 entreprise')
  })

  it('ne parle jamais de crédit, de quota, de coût ni d’un fournisseur', () => {
    render(<SearchEffortNotice effort={undefined} signalsCut={5} />)
    expect(screen.getByTestId('signals-budget').textContent).not.toMatch(
      /cr[ée]dit|quota|co[uû]t|budget|pappers|apollo|brave|firecrawl/i,
    )
  })

  it('sans coupe : aucune ligne', () => {
    const { container } = render(<SearchEffortNotice effort={undefined} signalsCut={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})
