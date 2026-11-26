import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TeamResearchItem } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

const useTeamResearch = vi.fn()
vi.mock('@/features/team-research/hooks/useTeamResearch', () => ({ useTeamResearch: () => useTeamResearch() }))

function item(over: Partial<TeamResearchItem>): TeamResearchItem {
  return {
    id: 'r',
    kind: 'discover',
    occurred_at: '2026-10-19T08:00:00.000Z',
    title: 'Banque & assurance · Lyon',
    scope_label: 'Lyon · Banque / Assurance',
    account_count: 2,
    open_action_count: 1,
    next_action: null,
    author_user_id: 'u1',
    author_name: 'Léa Marchand',
    account_id: null,
    filters: { city: 'Lyon' },
    ...over,
  }
}

const ITEMS: TeamResearchItem[] = [
  item({ id: 'd1' }),
  item({
    id: 'a1',
    kind: 'analysis',
    title: 'Société Générale',
    scope_label: null,
    account_count: 1,
    open_action_count: 1,
    next_action: 'Préparer le rendez-vous de cadrage',
    account_id: 'acc-1',
    filters: null,
    occurred_at: '2026-10-18T08:00:00.000Z',
  }),
  item({ id: 'd2', title: 'Data & BI · Marseille', account_count: null, open_action_count: 0, author_name: null }),
]

async function view() {
  const { TeamResearchView } = await import('./TeamResearchView')
  return renderWithRouter(<TeamResearchView />)
}

// Théo D team-recherches — les recherches conservées de toute l'équipe.
describe('TeamResearchView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useTeamResearch.mockReturnValue({ data: { items: ITEMS }, isLoading: false, isError: false, refetch: vi.fn() })
  })

  it('compte les recherches conservées et dit que la suite est au lecteur', async () => {
    await view()
    expect(await screen.findByRole('heading', { level: 2, name: /3 recherches conservées/i })).toBeTruthy()
    expect(screen.getByText(/À toi de choisir la suite/i)).toBeTruthy()
  })

  it('dit « compte analysé », jamais « compte consulté » (pas de mesure de consultation)', async () => {
    await view()
    expect(await screen.findByText('1 compte analysé')).toBeTruthy()
    expect(screen.queryByText(/consulté/i)).toBeNull()
  })

  it('un nombre de comptes absent n’est jamais « 0 » : il est nommé non mesuré', async () => {
    await view()
    const card = (await screen.findByText('Data & BI · Marseille')).closest('article') as HTMLElement
    expect(within(card).getByText(/non mesuré/i)).toBeTruthy()
    expect(within(card).queryByText(/^0 compte/)).toBeNull()
    // Une vraie absence d'action reste dite.
    expect(within(card).getByText('Aucune action ouverte sur ces comptes')).toBeTruthy()
  })

  it('filtre Découverte / Analyses de compte (front seul)', async () => {
    const user = userEvent.setup()
    await view()
    await user.click(await screen.findByRole('button', { name: 'Analyses de compte' }))
    expect(screen.getByText('Société Générale')).toBeTruthy()
    expect(screen.queryByText('Data & BI · Marseille')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Découverte' }))
    expect(screen.queryByText('Société Générale')).toBeNull()
    expect(screen.getByText('Banque & assurance · Lyon')).toBeTruthy()
  })

  it('« Examiner » ouvre le dossier du compte analysé ; une recherche Découvrir se reprend dans Découvrir', async () => {
    await view()
    const analysis = (await screen.findByText('Société Générale')).closest('article') as HTMLElement
    expect(
      within(analysis)
        .getByRole('link', { name: /Examiner/ })
        .getAttribute('href'),
    ).toContain('/accounts/acc-1')
    const discover = screen.getByText('Banque & assurance · Lyon').closest('article') as HTMLElement
    const resume = within(discover).getByRole('link', { name: /Reprendre dans Découvrir/ })
    expect(resume.getAttribute('href')).toContain('/discover')
    expect(resume.getAttribute('href')).toContain('city=Lyon')
  })

  it('#4463 — n’annonce aucun crédit sur une analyse relancée', async () => {
    await view()
    const analysis = (await screen.findByText('Société Générale')).closest('article') as HTMLElement
    expect(analysis.textContent).not.toMatch(/crédit/i)
  })

  it('espace sans recherche : état vide qui renvoie vers Découvrir', async () => {
    useTeamResearch.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false, refetch: vi.fn() })
    await view()
    expect((await screen.findAllByRole('link', { name: /Nouvelle recherche/ })).length).toBe(2)
    expect(screen.getByRole('status').getAttribute('data-screen-state')).toBe('empty_never')
  })

  it('garde les lots d’analyses, accessibles depuis la page', async () => {
    await view()
    expect(await screen.findByRole('link', { name: /Lots d’analyses/ })).toBeTruthy()
  })
})
