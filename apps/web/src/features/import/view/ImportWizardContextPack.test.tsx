import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('../api', () => ({
  useImportSources: () => ({
    data: [
      {
        key: 'talent_pool',
        objects: ['talent'],
        format: 'xlsx',
        tier: 'mvp',
        readable: false,
        imports: ['consultants'],
        skips: [],
        howTo: 'Exporte ton vivier.',
        fields: ['full_name'],
        required: ['full_name'],
      },
    ],
    isLoading: false,
    isError: false,
  }),
  useImportSessions: () => ({ data: [], refetch: () => undefined }),
  importApi: { create: vi.fn(), dryRun: vi.fn() },
}))

const { ImportWizard } = await import('./ImportWizard')

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ImportWizard />
    </QueryClientProvider>,
  )
}

// import-contexte Je.5 / Je.6 — /settings/import : la zone de dépôt EN TÊTE, une source « Grille go/no-go »
// (elle manquait), et une carte dont le format n'est pas lu renvoie vers la zone au lieu de promettre « bientôt ».
describe('ImportWizard × pack de contexte (Je.5, Je.6)', () => {
  it('Je.6 — une carte xlsx non lue par l’assistant renvoie vers la zone de dépôt, sans « Bientôt disponible »', () => {
    wrap()
    expect(screen.queryByText('Bientôt disponible')).not.toBeInTheDocument()
    // Deux renvois : la carte xlsx non lue ET la carte « Grille go/no-go » — tous vers la zone.
    const links = screen.getAllByRole('link', { name: 'Dépose ce fichier ci-dessus' })
    expect(links).toHaveLength(2)
    for (const link of links) expect(link).toHaveAttribute('href', '#depose-tes-documents')
  })

  it('Je.5 — la source « Grille go/no-go » existe et renvoie vers la zone ET vers les règles de l’espace', () => {
    wrap()
    const card = screen.getByTestId('import-source-qualification-grid')
    expect(card).toHaveTextContent('Grille go/no-go')
    expect(screen.getByRole('link', { name: 'Ouvrir la grille de l’espace' })).toHaveAttribute(
      'href',
      '/settings/workspace-rules',
    )
  })

  it('Je.5 / #4426.1 — l’APPELANT : UNE zone en tête de /settings/import ; l’import universel y est un choix, l’assistant par outil est replié', () => {
    // #4533 : /settings/import redirige vers Mes données › Imports, l'écran vit dans ImportsPanel — l'en-tête, les trois entrées, la zone, « Ce
    // qui sera vérifié » et l'assistant par outil replié.
    const route = readFileSync(join(__dirname, 'ImportsPanel.tsx'), 'utf-8')
    expect(route.length).toBeGreaterThan(0)
    const zone = route.indexOf('<ContextPackDropzone')
    expect(zone).toBeGreaterThan(-1)
    // L'import universel est passé DANS la zone (moreChoices), jamais posé à côté comme une entrée de plus.
    expect(route).toMatch(/<ContextPackDropzone[^>]*moreChoices=\{<UniversalImportLauncher \/>\}/)
    expect(route.match(/<UniversalImportLauncher/g)).toHaveLength(1)
    // L'assistant par outil reste (aucune capacité perdue) mais REPLIÉ sous la zone.
    expect(zone).toBeLessThan(route.indexOf('<details'))
    expect(route.indexOf('<details')).toBeLessThan(route.indexOf('<ImportWizard'))
  })
})
