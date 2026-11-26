import type { AccountListItem } from '@bellum/contracts'
import { fireEvent, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AnalysesHistory } from './AnalysesHistory'

const h = vi.hoisted(() => ({
  all: [] as unknown[] | undefined,
  mine: [] as unknown[] | undefined,
  batches: [] as unknown[],
}))
vi.mock('../hooks/useRecentAnalyses', () => ({
  useAnalysesHistory: (ownership: 'all' | 'mine') => (ownership === 'all' ? h.all : h.mine),
}))
vi.mock('@/features/analysis-batches/api', () => ({
  useAnalysisBatches: () => ({ data: h.batches }),
}))

const account = (over: Partial<AccountListItem>): AccountListItem =>
  ({
    id: 'a1',
    company_name: 'Altiver Industries',
    sector: 'Industrie',
    status: 'completed',
    created_at: '2026-10-16T09:45:00Z',
    last_analyzed_at: '2026-10-16T09:45:00Z',
    owner: { user_id: 'u-1', name: 'Théo Haddad' },
    ...over,
  }) as AccountListItem

describe('AnalysesHistory — « Mes analyses » (refonte Théo R2)', () => {
  beforeAll(() => {
    window.scrollTo = vi.fn()
  })
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    h.all = []
    h.mine = []
    h.batches = []
  })

  it('dessine SON en-tête (maquette R2) : un seul h1, la phrase, « Revenir à mon cadrage » et « Nouvelle analyse »', async () => {
    renderWithRouter(<AnalysesHistory />)
    await screen.findByRole('tablist', { name: 'Analyses affichées' })
    const titles = screen.getAllByRole('heading', { level: 1 })
    expect(titles).toHaveLength(1)
    expect(titles[0]).toHaveTextContent('Tes analyses')
    expect(screen.getByText('Retrouve les dossiers consultés et le cadrage que tu avais préparé.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Revenir à mon cadrage' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nouvelle analyse' })).toBeInTheDocument()
  })

  it('l’ordre de la maquette : en-tête, filtre Équipe / Moi, analyses, lots, puis la note', async () => {
    h.all = [account({ id: 'a1' })]
    h.batches = [
      {
        id: 'b1',
        createdAt: '2026-10-14T10:00:00Z',
        total: 8,
        counts: { done: 6, partial: 0, resolved: 0, queued: 0, running: 1, failed: 1, needs_resolution: 0 },
      },
    ]
    const { container } = renderWithRouter(<AnalysesHistory />)
    await screen.findAllByRole('table')
    const order = [...container.querySelectorAll('[data-analyze-section], [data-history-section], h2')].map(
      el => el.getAttribute('data-analyze-section') ?? el.getAttribute('data-history-section') ?? el.textContent,
    )
    expect(order).toEqual(['header', 'filters', 'analyses', 'Lots d’analyses'])
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Toute l’équipe', 'Moi'])
  })

  it('une absence ne fait aucune ligne : un espace sans analyse le dit, sans tableau ni « 0 »', async () => {
    renderWithRouter(<AnalysesHistory />)
    expect(await screen.findByText('Aucune analyse dans l’espace pour l’instant.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('liste les analyses dans le composant tableau commun, avec leur état en mots et leur porteur', async () => {
    h.all = [
      account({ id: 'a1' }),
      account({
        id: 'a2',
        company_name: 'BPCE Services',
        status: 'analyzing',
        owner: { user_id: 'u-2', name: 'Inès Morel' },
      }),
      account({ id: 'a3', company_name: 'Rhône Prévoyance', status: 'error' }),
    ]
    h.mine = [h.all[0], h.all[2]]
    renderWithRouter(<AnalysesHistory />)
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.getByText('Altiver Industries')).toBeInTheDocument()
    // L'état ne s'écrit que s'il dit quelque chose : une analyse terminée n'a pas de pastille (maquette R2).
    expect(screen.queryByText('Terminée')).not.toBeInTheDocument()
    expect(screen.getByText('En cours')).toBeInTheDocument()
    expect(screen.getByText('Échouée')).toBeInTheDocument()
    // La ligne d'un collègue le NOMME ; les miennes ne répètent pas mon nom.
    expect(screen.getByText('Inès Morel')).toBeInTheDocument()
    expect(screen.queryByText('Théo Haddad')).not.toBeInTheDocument()
    expect(screen.getByText('3 analyses dans l’espace · 2 lancées par toi')).toBeInTheDocument()
  })

  it('une analyse en cours se SUIT ; une terminée se REPREND ou s’ouvre ; une échouée se réessaie', async () => {
    h.all = [
      account({ id: 'a2', company_name: 'BPCE Services', status: 'analyzing' }),
      account({ id: 'a1' }),
      account({ id: 'a3', company_name: 'Rhône Prévoyance', status: 'error' }),
    ]
    h.mine = h.all
    renderWithRouter(<AnalysesHistory />)
    await screen.findByRole('table')
    expect(screen.getByRole('link', { name: 'Suivre' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reprendre' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Réessayer' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Voir le dossier' })).toHaveLength(1)
  })

  it('la ligne d’un collègue ne reprend pas son cadrage : elle ouvre le dossier, rien d’autre', async () => {
    h.all = [account({ id: 'a5', company_name: 'Banque Valmont', owner: { user_id: 'u-3', name: 'Karim Haddou' } })]
    h.mine = []
    renderWithRouter(<AnalysesHistory />)
    await screen.findByRole('table')
    expect(screen.getByRole('link', { name: 'Voir le dossier' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Reprendre' })).not.toBeInTheDocument()
    expect(screen.getByText('Karim Haddou')).toBeInTheDocument()
  })

  it('« Moi » réduit l’historique à mes analyses, en un clic', async () => {
    h.all = [account({ id: 'a1' }), account({ id: 'a2', company_name: 'NovaSanté' })]
    h.mine = [h.all[0]]
    renderWithRouter(<AnalysesHistory />)
    await screen.findByRole('table')
    expect(screen.getByText('NovaSanté')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Moi' }))
    expect(screen.queryByText('NovaSanté')).not.toBeInTheDocument()
    expect(screen.getByText('Altiver Industries')).toBeInTheDocument()
  })

  it('« Moi » sans analyse le dit ; ce n’est pas le même message que l’espace vide', async () => {
    h.all = [account({ id: 'a1' })]
    h.mine = []
    renderWithRouter(<AnalysesHistory />)
    await screen.findByRole('table')
    fireEvent.click(screen.getByRole('tab', { name: 'Moi' }))
    expect(screen.getByText('Tu n’as lancé aucune analyse pour l’instant.')).toBeInTheDocument()
  })

  it('les lots lancés depuis Découvrir ont leur place : avancement en mots, lien vers le lot', async () => {
    h.batches = [
      {
        id: 'b1',
        createdAt: '2026-10-14T10:00:00Z',
        total: 8,
        counts: { done: 6, partial: 0, resolved: 0, queued: 0, running: 1, failed: 1, needs_resolution: 0 },
      },
    ]
    renderWithRouter(<AnalysesHistory />)
    expect(await screen.findByText('Lots d’analyses')).toBeInTheDocument()
    expect(screen.getByText('8 comptes')).toBeInTheDocument()
    expect(screen.getByText('6 terminées')).toBeInTheDocument()
    expect(screen.getByText('1 en cours')).toBeInTheDocument()
    expect(screen.getByText('1 à reprendre')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voir le lot' })).toBeInTheDocument()
  })

  it('aucun crédit nulle part', async () => {
    h.all = [account({ id: 'a1' })]
    renderWithRouter(<AnalysesHistory />)
    await screen.findByRole('table')
    expect(document.body).not.toHaveTextContent(/crédit/i)
  })
})
