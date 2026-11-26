import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { AnalysisHistoryRow, SessionUser } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/features/auth/session-context'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))

const { AnalysisHistoryContent } = await import('./AnalysisHistoryPage')

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function run(n: number, over: Partial<AnalysisHistoryRow> = {}): AnalysisHistoryRow {
  return {
    id: id(n),
    accountId: id(100 + n),
    companyName: `Compte ${n}`,
    headquarters: 'Lyon',
    status: 'completed',
    scopeMode: 'groupe',
    depth: 'deep',
    startedAt: '2026-10-16T09:45:00.000Z',
    completedAt: '2026-10-16T09:51:00.000Z',
    startedBy: { userId: id(900), name: 'Théo Haddad' },
    mine: true,
    ...over,
  }
}

const SPACE = {
  runs: [
    run(1),
    run(2, { status: 'error', depth: 'quick' }),
    run(3, { mine: false, startedBy: { userId: id(901), name: 'Inès Morel' } }),
  ],
  counts: { space: 3, mine: 2 },
}
const MINE = { runs: SPACE.runs.filter(r => r.mine), counts: { space: 2, mine: 2 } }

function renderContent() {
  return renderWithRouter(
    <SessionContext.Provider value={{ user: { id: id(900) } as SessionUser, loading: false }}>
      <AnalysisHistoryContent />
    </SessionContext.Provider>,
    '/search/history',
  )
}

beforeEach(() => {
  resetTestQueryClient()
  apiFetch.mockReset()
  apiFetch.mockImplementation(async ({ path, method }: { path: string; method?: string }) => {
    if (path === '/analysis/history?scope=me') return MINE
    if (path === '/analysis/history?scope=space') return SPACE
    if (path === '/analysis-batches') return []
    if (method === 'POST') return { id: id(1) }
    return {}
  })
})

describe('Théo B r2-mes-analyses — Mes analyses', () => {
  it('A5 — s’ouvre sur « Moi » : les analyses que j’ai lancées, et le décompte', async () => {
    renderContent()
    expect(await screen.findByText('Compte 1')).toBeInTheDocument()
    expect(screen.queryByText('Compte 3')).not.toBeInTheDocument()
    expect(screen.getByText('2 analyses lancées par toi')).toBeInTheDocument()
  })

  it('A5 — « Toute l’équipe » montre l’espace, nomme qui a lancé, sans geste sur la ligne d’un collègue', async () => {
    renderContent()
    fireEvent.click(await screen.findByRole('button', { name: 'Toute l’équipe' }))
    const colleague = (await screen.findByText('Compte 3')).closest('li') as HTMLElement
    expect(within(colleague).getByText(/lancée par Inès Morel/)).toBeInTheDocument()
    expect(within(colleague).getByRole('link', { name: 'Voir le dossier' })).toBeInTheDocument()
    expect(within(colleague).queryByRole('link', { name: 'Reprendre' })).not.toBeInTheDocument()
    expect(within(colleague).queryByRole('button', { name: /Retirer/ })).not.toBeInTheDocument()
    expect(screen.getByText('3 analyses dans l’espace · 2 lancées par toi')).toBeInTheDocument()
  })

  it('R5 — « Reprendre » sur une analyse terminée, « Réessayer » sur une analyse échouée', async () => {
    renderContent()
    const done = (await screen.findByText('Compte 1')).closest('li') as HTMLElement
    expect(within(done).getByRole('link', { name: 'Reprendre' })).toBeInTheDocument()
    const failed = screen.getByText('Compte 2').closest('li') as HTMLElement
    expect(within(failed).getByText('Échouée')).toBeInTheDocument()
    expect(within(failed).getByRole('link', { name: 'Réessayer' })).toBeInTheDocument()
    expect(failed.textContent).not.toMatch(/crédit|rembours/i)
    expect(within(failed).queryByRole('link', { name: 'Voir le dossier' })).not.toBeInTheDocument()
  })

  it('N1 — « Retirer » masque MA ligne', async () => {
    renderContent()
    fireEvent.click(await screen.findByRole('button', { name: 'Retirer l’analyse de Compte 1 de l’historique' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({ path: `/analysis/history/${id(1)}/hide`, method: 'POST' }),
      ),
    )
  })

  it('A6 — les lots ont une place : un lien vers Découvrir et l’avancement du dernier lot', async () => {
    apiFetch.mockImplementation(async ({ path }: { path: string }) => {
      if (path === '/analysis/history?scope=me') return MINE
      if (path === '/analysis-batches')
        return [
          {
            id: 'b1',
            source: 'discover',
            createdAt: '2026-10-14T10:00:00.000Z',
            canceledAt: null,
            status: 'running',
            counts: {
              resolved: 0,
              to_confirm: 0,
              queued: 0,
              running: 1,
              partial: 0,
              done: 6,
              failed: 1,
              canceled: 0,
              needs_resolution: 0,
            },
            total: 8,
            charged: 8,
            items: [],
            contextMode: null,
          },
        ]
      return {}
    })
    renderContent()
    expect(await screen.findByText('8 comptes')).toBeInTheDocument()
    expect(screen.getByText('6 terminées · 1 en cours · 1 échouée')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Lancer un lot depuis Découvrir' })).toBeInTheDocument()
  })

  it('sans analyse, l’état vide dit quoi faire', async () => {
    apiFetch.mockImplementation(async ({ path }: { path: string }) =>
      path.startsWith('/analysis/history') ? { runs: [], counts: { space: 0, mine: 0 } } : [],
    )
    renderContent()
    expect(await screen.findByText('Tu n’as lancé aucune analyse pour l’instant.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nouvelle analyse' })).toBeInTheDocument()
  })
})
