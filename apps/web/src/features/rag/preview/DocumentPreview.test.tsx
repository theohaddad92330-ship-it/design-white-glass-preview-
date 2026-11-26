import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import type { RagDocumentPreview } from '@bellum/contracts'
import { SpreadsheetGrid } from './SpreadsheetGrid'
import { DocumentPreview } from './DocumentPreview'

let preview: RagDocumentPreview | undefined
vi.mock('@/features/rag/hooks/useRagDocumentContent', () => ({
  useRagDocumentContent: () => ({ data: preview, isLoading: false, isError: false }),
}))

const wrap = (node: React.ReactNode) => <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>

describe('#3803 (3803.2) — SpreadsheetGrid', () => {
  const sheets = [
    {
      name: 'Campagnes',
      rows: [
        ['Compte', 'Canal'],
        ['SNCF', 'Email'],
      ],
    },
    {
      name: 'Budget',
      rows: [
        ['Poste', 'Montant'],
        ['Salon', '1200'],
      ],
    },
  ]

  it('deux onglets → deux boutons ; cliquer le second montre SA grille', () => {
    render(<SpreadsheetGrid sheets={sheets} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(tab => tab.textContent)).toEqual(['Campagnes', 'Budget'])
    expect(screen.getByText('SNCF')).toBeTruthy()

    fireEvent.click(tabs[1] as HTMLElement)
    expect(screen.getByText('Salon')).toBeTruthy()
    expect(screen.queryByText('SNCF')).toBeNull()
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true')
  })

  it('porte les en-têtes de colonnes d’un tableur (A, B…)', () => {
    render(<SpreadsheetGrid sheets={sheets} />)
    expect(screen.getByRole('columnheader', { name: 'A' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'B' })).toBeTruthy()
  })
})

describe('#3803 (3803.4) — DocumentPreview sans original', () => {
  it('montre le texte ET dit « Original non conservé », sans bouton de téléchargement', () => {
    preview = { id: 'doc-1', title: 'Ancien', content: 'Le texte extrait.', category: null, source: null }
    render(wrap(<DocumentPreview documentId="doc-1" />))
    expect(screen.getByText('Original non conservé')).toBeTruthy()
    expect(screen.getByText('Le texte extrait.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Télécharger l’original/ })).toBeNull()
  })

  it('un original texte (md) : le texte, et « Télécharger l’original »', () => {
    preview = {
      id: 'doc-2',
      title: 'Charte',
      content: '# Charte',
      category: null,
      source: { fileName: 'charte.md', contentType: 'text/markdown', byteSize: 8 },
    }
    render(wrap(<DocumentPreview documentId="doc-2" />))
    expect(screen.queryByText('Original non conservé')).toBeNull()
    expect(screen.getByRole('button', { name: /Télécharger l’original/ })).toBeTruthy()
  })
})
