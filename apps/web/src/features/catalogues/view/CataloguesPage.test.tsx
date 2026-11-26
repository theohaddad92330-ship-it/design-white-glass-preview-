import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => 'Théo' }))
vi.mock('@/features/mobile/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('./SkillAliasQueue', () => ({ SkillAliasQueue: () => <p>FILE-ALIAS</p> }))

const { CataloguesView } = await import('./CataloguesPage')

const CATALOGUES = {
  items: [
    {
      key: 'loss_reasons',
      editable: 'editable',
      values: [{ id: '1', label: 'Budget non confirmé', usage: 9, archived: false }],
    },
    {
      key: 'account_park_reasons',
      editable: 'editable',
      values: [{ id: '2', label: 'Hors de notre zone', usage: 14, archived: false }],
    },
    { key: 'need_unstaffable_reasons', editable: 'editable', values: [] },
    { key: 'offers', editable: 'closed', values: [] },
  ],
}

function renderView(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  apiFetch.mockReset()
  apiFetch.mockResolvedValue(CATALOGUES)
})

/**
 * Théo D settings-espace.R4 / N3 — un catalogue par onglet : `only` restreint la vue aux catalogues demandés, sans
 * titre de page ni file d'alias (elle vit dans l'onglet Vocabulaire).
 */
describe('CataloguesView — restriction par onglet', () => {
  it('sans `only` : tous les catalogues éditables, le titre de page et la file des alias (comportement d’avant)', async () => {
    renderView(<CataloguesView />)
    expect(await screen.findByText('Budget non confirmé')).toBeInTheDocument()
    expect(screen.getByText('Hors de notre zone')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByText('FILE-ALIAS')).toBeInTheDocument()
  })

  it('avec `only` : SEUL le catalogue demandé, sans titre de page ni file d’alias', async () => {
    renderView(<CataloguesView only={['account_park_reasons']} />)
    expect(await screen.findByText('Hors de notre zone')).toBeInTheDocument()
    expect(screen.queryByText('Budget non confirmé')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(screen.queryByText('FILE-ALIAS')).not.toBeInTheDocument()
  })

  it('NON : un catalogue absent de `only` ne s’affiche pas, même s’il est éditable', async () => {
    renderView(<CataloguesView only={['need_unstaffable_reasons']} />)
    expect(await screen.findByText('Aucune valeur pour l’instant.')).toBeInTheDocument()
    expect(screen.queryByText('Hors de notre zone')).not.toBeInTheDocument()
  })

  it('refonte Théo — un bloc par liste : Valeur · Usage · État · Actions, puis « Ajouter une valeur » en ligne', async () => {
    renderView(<CataloguesView only={['loss_reasons']} />)
    expect(await screen.findByText('Budget non confirmé')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Motifs de perte de projet' })).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual([
      'Valeur',
      'Usage',
      'État',
      'Actions',
    ])
    expect(screen.getByText('9 usages')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retirer « Budget non confirmé »' })).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Ajouter une valeur' })).toBeInTheDocument()
  })
})
