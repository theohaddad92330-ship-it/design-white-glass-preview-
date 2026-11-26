import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { AccountRow } from '@/features/accounts/view/accounts-list/types'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string }) => (
    <a href={to} {...(rest as object)}>
      {children}
    </a>
  ),
}))
vi.mock('@/features/accounts/hooks/useAccounts', () => ({ useAccounts: () => ({ data: undefined }) }))
vi.mock('@/features/universal-import/view/ImportPortfolioDialog', () => ({
  ImportPortfolioDialog: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Importer dans le portefeuille">
      <button onClick={onClose}>fermer import</button>
    </div>
  ),
}))

const { AnalyzeRecentRail, MyAnalysesButton, OpenDossierChips } = await import('./AnalyzeRecentRail')

const row = (over: Partial<AccountRow>): AccountRow =>
  ({
    id: 'a',
    company_name: 'Acme',
    priority_score: 5,
    status: 'completed',
    created_at: '2026-10-01T00:00:00Z',
    last_analyzed_at: '2026-10-14T10:00:00Z',
    ...over,
  }) as AccountRow

describe('Analyser un compte — chips « Ou ouvre un dossier » et « Récemment »', () => {
  it('« Ou ouvre un dossier » : trois dossiers terminés au plus, jamais une analyse ratée', () => {
    render(
      <OpenDossierChips
        rows={[
          row({ id: '1', company_name: 'Renault' }),
          row({ id: '2', company_name: 'ENGIE', status: 'error' }),
          row({ id: '3', company_name: 'SNCF' }),
          row({ id: '4', company_name: 'Orange' }),
          row({ id: '5', company_name: 'Thales' }),
        ]}
      />,
    )
    expect(screen.getByText('Ou ouvre un dossier :')).toBeVisible()
    expect(screen.getAllByRole('link').map(l => l.textContent)).toEqual(['Renault', 'SNCF', 'Orange'])
  })

  it('SAIT DIRE NON : sans dossier terminé, les chips se taisent', () => {
    const { container } = render(<OpenDossierChips rows={[row({ status: 'error' })]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('« Mes analyses » ouvre la liste : terminée → Ouvrir, échouée → Relancer, en cours → aucune porte', () => {
    render(
      <MyAnalysesButton
        rows={[
          row({ id: '1', company_name: 'Renault' }),
          row({ id: '2', company_name: 'ENGIE', status: 'error' }),
          row({ id: '3', company_name: 'Airbus', status: 'analyzing' }),
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Mes analyses' }))
    expect(screen.getByRole('link', { name: 'Ouvrir' })).toHaveAttribute('href', '/accounts/$id')
    expect(screen.getByRole('link', { name: 'Relancer' })).toHaveAttribute('href', '/search')
    expect(screen.getByText('En cours')).toBeVisible()
    expect(screen.getByText('Échouée')).toBeVisible()
  })

  it('« Mes analyses » sans analyse le dit en une phrase', () => {
    render(<MyAnalysesButton rows={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mes analyses' }))
    expect(screen.getByText(/Aucune analyse pour l’instant/)).toBeVisible()
  })

  it('le pied ouvre « Ce que tu retrouveras » et la modale d’import', () => {
    render(<AnalyzeRecentRail rows={[row({ id: '1', company_name: 'Renault' })]} />)
    expect(screen.getByText('Récemment')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Ce que tu retrouveras' }))
    expect(screen.getByText(/rien ne part sans toi/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Importer un fichier ou une liste' }))
    expect(screen.getByRole('dialog', { name: 'Importer dans le portefeuille' })).toBeVisible()
  })
})
