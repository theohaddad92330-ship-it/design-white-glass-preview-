/**
 * ⚠️ RENVERSEMENT ASSUMÉ ET DATÉ — Louis 14/10/2026 (#4158 (complément BU) / #4158.44, lot L7).
 *
 * Ce fichier prouvait jusqu'au 14/10 le contraire de ce qu'il prouve
 * aujourd'hui. #1809 (« segmenter les parties de cette page et les replier par
 * défaut ») puis #2405.3 (les sept intitulés Aujourd'hui / Semaine / Équipe /
 * Pipe / Staffing / Missions / Adoption, tranché le 22/09 soir) avaient fait de
 * `/team` sept sections repliées à l'arrivée. Louis, le 14/10 : « Je suis
 * vraiment pas satisfait du dashboard en lui-même, son contenu, sa
 * présentation » — à l'arrivée, on ne voyait rien.
 *
 * Le test CHANGE DE SENS, il ne disparaît pas : l'historique de #1809 et de
 * #2405.3 reste lisible ici et dans leurs issues. Ce qu'il garde désormais :
 *  - rien n'est replié au-dessus du détail : la table des membres et « À
 *    traiter » sont dans le document dès l'arrivée ;
 *  - les sept anciens intitulés ne sont plus des accordéons ;
 *  - SEUL le détail du bas se replie (Adoption, hygiène Missions, contacts à
 *    traiter), et une section de détail sans donnée ne s'affiche pas — jamais
 *    un en-tête replié sur du vide (la moitié de #1809 qui reste vraie).
 *
 * Le comportement du repli lui-même (un `useState(false)`, jamais restauré
 * ouvert) reste couvert par `CollapsedSection.test.tsx` (GA-26).
 */
import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataHygiene, ManagerTeamStats } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { i18n } from '@/i18n'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'
import { ManagerDashboardPage } from './ManagerDashboardPage'

const useManagerStatsMock = vi.fn()
vi.mock('../hooks/useManagerStats', () => ({ useManagerStats: () => useManagerStatsMock() }))
vi.mock('../hooks/useAssignAccount', () => ({ useAssignAccount: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('../hooks/useObjectives', () => ({
  useTeamObjectives: () => ({ isSuccess: false, data: undefined }),
  useMyObjective: () => ({ isSuccess: false, data: undefined }),
  useUpsertMyObjective: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
}))
vi.mock('../hooks/useTeamComments', () => ({
  useTeamComments: () => ({ isSuccess: false, data: undefined }),
  useCreateTeamComment: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' }, loading: false }) }))

const MEMBERS = [
  {
    user_id: 'u1',
    name: 'Alice Martin',
    email: 'alice@esn.fr',
    role: 'owner' as const,
    accounts: 7,
    contacts: 30,
    emails_sent: 4,
    analyses: 6,
    last_activity_at: '2026-07-19T10:00:00.000Z',
  },
]

const STATS: ManagerTeamStats = {
  workspace: { id: 'w1', name: 'Skaizen', member_count: 1 },
  totals: { accounts: 12, contacts: 40, emails_sent: 5, analyses: 9 },
  pipeline: [{ status: 'new', count: 10 }],
  members: MEMBERS,
  coverage: { total_accounts: 12, assigned: 5, unassigned: 7 },
}

/** Le détail du bas vit dans Activité & échanges › Journal ; la table des membres, dans Portefeuilles. */
const JOURNAL = '/team?onglet=activite&sous=journal'
const PORTFOLIOS = '/team?onglet=objectifs&sous=portefeuilles'

async function mount(stats: ManagerTeamStats = STATS, path: string = JOURNAL) {
  useManagerStatsMock.mockReturnValue({ data: stats, isLoading: false, error: null })
  renderWithRouter(<ManagerDashboardPage />, path)
  await screen.findByRole('heading', { level: 1 })
}

beforeEach(async () => {
  useManagerStatsMock.mockReset()
  vi.mocked(apiFetch).mockReset()
  vi.mocked(apiFetch).mockResolvedValue({})
  // `pilotage-hygiene` porte un `staleTime` de production (GA-26) : sans ce
  // nettoyage, un test peut lire le cache laissé par le précédent.
  resetTestQueryClient()
  await i18n.changeLanguage('fr')
})

describe('ManagerDashboardPage — renversement du 14/10 : plus rien de replié au-dessus du détail (ex-#1809, ex-#2405.3)', () => {
  it('montre la table des membres et « À traiter » dès l’arrivée, sans un clic', async () => {
    await mount(STATS, PORTFOLIOS)
    // Hier, « Alice Martin » n'apparaissait qu'une fois « Équipe » dépliée.
    expect(screen.getAllByText('Alice Martin').length).toBeGreaterThan(0)
    expect(screen.getByRole('region', { name: 'À traiter' })).toBeInTheDocument()
  })

  it('les sept anciens intitulés ne sont plus des accordéons', async () => {
    await mount()
    for (const title of ['Aujourd’hui', 'Semaine', 'Équipe', 'Pipe', 'Staffing', 'Missions']) {
      expect(screen.queryByRole('button', { name: title })).not.toBeInTheDocument()
    }
  })

  it('SEUL le détail du bas se replie : Adoption et Contacts à traiter, fermés à l’arrivée', async () => {
    await mount()
    for (const title of ['Adoption', 'Contacts à traiter']) {
      const toggle = screen.getByRole('button', { name: title })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(toggle).toHaveAttribute('type', 'button')
    }
    // Leur contenu n'est PAS dans le document tant qu'ils sont fermés : le
    // total « Comptes » n'apparaît qu'une fois « Adoption » ouverte.
    expect(screen.queryByRole('link', { name: /^Comptes/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Adoption' }))
    expect(screen.getByRole('link', { name: /^Comptes/ })).toBeInTheDocument()
  })

  it('« Contacts à traiter » n’affiche pas un en-tête replié sur du vide', async () => {
    await mount({ ...STATS, pipeline: [] })
    expect(screen.queryByRole('button', { name: 'Contacts à traiter' })).not.toBeInTheDocument()
  })

  it('« Hygiène des missions » apparaît quand la lecture d’hygiène porte au moins une ligne missions', async () => {
    const hygiene: DataHygiene = {
      lines: [
        { key: 'missions_without_end_date', count: 3, total: 40, link: '/missions' },
        { key: 'missions_without_cost', count: null, total: null, link: '/missions/facturation' },
      ],
    }
    vi.mocked(apiFetch).mockImplementation(async (args: { path: string }) =>
      args.path === '/pilotage/hygiene' ? hygiene : {},
    )
    await mount()
    // La ligne vient d'une VRAIE requête react-query, asynchrone : `findBy…`.
    expect(await screen.findByRole('button', { name: 'Hygiène des missions' })).toBeInTheDocument()
  })

  it('« Hygiène des missions » ne s’affiche PAS quand la lecture d’hygiène échoue', async () => {
    await mount()
    expect(screen.queryByRole('button', { name: 'Hygiène des missions' })).not.toBeInTheDocument()
  })
})
