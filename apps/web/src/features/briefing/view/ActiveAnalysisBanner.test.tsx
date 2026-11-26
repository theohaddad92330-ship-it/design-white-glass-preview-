import type { ActiveAnalysisRun } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * #2145.9 / #2100.9 — « job important en attente → mis en avant par
 * Laura/Aujourd'hui ». Aujourd'hui LIT le job existant (`GET /accounts/analyzing`)
 * plutôt que d'en inventer un second moteur.
 */
let runs: ActiveAnalysisRun[] | undefined

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to ?? '#'}>{children}</a>,
}))
vi.mock('../hooks/useActiveAnalysisRuns', () => ({
  useActiveAnalysisRuns: () => ({ data: runs }),
}))

const { ActiveAnalysisBanner } = await import('./ActiveAnalysisBanner')

const run = (over: Partial<ActiveAnalysisRun> = {}): ActiveAnalysisRun => ({
  account_id: 'a1',
  company_name: 'Thales',
  started_at: new Date(Date.now() - 12 * 60_000).toISOString(),
  ...over,
})

describe('ActiveAnalysisBanner', () => {
  it("n'affiche rien tant qu'aucun job ne tourne — jamais un titre vide", () => {
    runs = []
    const { container } = render(<ActiveAnalysisBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it("n'affiche rien tant que la lecture n'a pas répondu — jamais une donnée devinée", () => {
    runs = undefined
    const { container } = render(<ActiveAnalysisBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('met en avant le job en cours, avec depuis quand il tourne', () => {
    runs = [run({ company_name: 'Thales' })]
    render(<ActiveAnalysisBanner />)

    expect(screen.getByText(/Analyse en cours : Thales/)).toBeInTheDocument()
    expect(screen.getByText(/depuis 12 min/)).toBeInTheDocument()
  })

  it("nomme le compte le plus ANCIEN d'abord et compte le reste — jamais plus de trois côté serveur", () => {
    runs = [
      run({ account_id: 'a1', company_name: 'Thales' }),
      run({ account_id: 'a2', company_name: 'Orange' }),
      run({ account_id: 'a3', company_name: 'Sopra' }),
    ]
    render(<ActiveAnalysisBanner />)

    expect(screen.getByText(/Thales.*\+2 autres/)).toBeInTheDocument()
  })
})
