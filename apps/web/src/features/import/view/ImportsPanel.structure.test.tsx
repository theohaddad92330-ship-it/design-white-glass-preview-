import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}))
vi.mock('@/features/import/view/ImportWizard', () => ({ ImportWizard: () => <p>ASSISTANT-PAR-OUTIL</p> }))
vi.mock('@/features/universal-import/view/ContextPackDropzone', () => ({
  ContextPackDropzone: () => <p>ZONE-DE-DEPOT</p>,
}))
vi.mock('@/features/universal-import/view/UniversalImportHistory', () => ({
  UniversalImportHistory: () => <p>HISTORIQUE-IMPORTS</p>,
}))
vi.mock('@/features/universal-import/view/UniversalImportLauncher', () => ({ UniversalImportLauncher: () => null }))

describe('Théo D settings-outils (Imports) — structure de la maquette (contrôle 23/10)', () => {
  it('DEUX entrées côte à côte (vivier, outil connecté — l’export vit dans l’onglet Exports, une seule fois), puis « Ce qui sera vérifié » avec l’historique', async () => {
    const { ImportsPanel } = await import('./ImportsPanel')
    render(<ImportsPanel />)
    const entries = screen.getAllByRole('listitem').map(item => item.querySelector('h3')?.textContent)
    expect(entries).toEqual(['page.vivierTitle', 'page.fromToolTitle'])
    expect(screen.queryByText('page.exportTitle')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'page.vivierAction' })).toHaveAttribute('href', '#import-dropzone')
    const checks = screen.getByRole('heading', { level: 2, name: 'page.checksTitle' }).closest('section') as HTMLElement
    expect(checks).toHaveTextContent('HISTORIQUE-IMPORTS')
    expect(screen.getByRole('link', { name: 'page.checksJournalLink' })).toHaveAttribute('href', '/settings/activity')
  })

  it('#4605.5 — « Historique » n’apparaît QU’UNE fois : pas de ligne du même nom collée au tableau des imports', async () => {
    const { ImportsPanel } = await import('./ImportsPanel')
    render(<ImportsPanel />)
    expect(screen.queryByText('page.checksHistoryTitle')).not.toBeInTheDocument()
    expect(screen.queryByText('page.checksHistoryDescription')).not.toBeInTheDocument()
    expect(screen.getAllByText('HISTORIQUE-IMPORTS')).toHaveLength(1)
    // le renvoi vers le journal reste, à côté de l’historique qu’il prolonge
    const checks = screen.getByRole('heading', { level: 2, name: 'page.checksTitle' }).closest('section') as HTMLElement
    expect(checks).toContainElement(screen.getByRole('link', { name: 'page.checksJournalLink' }))
  })

  it('#4605.5 — « Reprendre depuis un outil » n’est pas un titre isolé : un bloc, sa phrase visible, puis l’assistant replié', async () => {
    const { ImportsPanel } = await import('./ImportsPanel')
    render(<ImportsPanel />)
    const block = screen.getByTestId('import-by-tool')
    expect(block.tagName).toBe('SECTION')
    expect(screen.getByRole('heading', { level: 2, name: 'byToolSummary' })).toBeInTheDocument()
    expect(block).toHaveTextContent('byToolDescription')
    expect(block.querySelector('details')).not.toBeNull()
  })
})
