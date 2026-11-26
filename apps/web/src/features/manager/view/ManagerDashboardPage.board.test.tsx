/**
 * #4158.37-46 (lot L7, Louis 14/10/2026) — le tableau `/team` en PYRAMIDE
 * INVERSÉE : ce qui demande une action en haut, l'état au milieu, le détail et
 * l'historique en bas, replié. UNE période pour toute la page, dans l'URL.
 *
 * Chaque bloc est rendu AVEC données puis SANS données — et sans données, il ne
 * fait AUCUNE ligne (doctrine « on n'affiche pas ce qu'on n'a pas »).
 */
import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagerTeamStats } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { i18n } from '@/i18n'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'
import { ManagerDashboardPage } from './ManagerDashboardPage'

const useManagerStatsMock = vi.fn()
vi.mock('./team/TeamPortfolios', () => ({
  TeamPortfolios: () => <section aria-label="Portefeuilles (liste)" data-board-block="portfolios" />,
}))
vi.mock('./team/TeamDealsReview', () => ({
  TeamDealsReview: ({ review }: { review?: { items: { label: string }[] } }) => (
    <section aria-label="Revue des affaires (table)" data-board-block="pipeline-review">
      {(review?.items ?? []).map(item => (
        <span key={item.label}>{item.label}</span>
      ))}
    </section>
  ),
}))
vi.mock('../hooks/useManagerStats', () => ({
  useManagerStats: (period: number) => useManagerStatsMock(period),
}))
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

const member = (user_id: string, name: string, extra: Partial<ManagerTeamStats['members'][number]> = {}) => ({
  user_id,
  name,
  email: `${user_id}@esn.fr`,
  role: 'sales' as const,
  accounts: 1,
  contacts: 1,
  emails_sent: 0,
  analyses: 0,
  last_activity_at: '2026-10-10T10:00:00.000Z',
  ...extra,
})

/** Ordre SERVEUR volontairement non alphabétique (le service trie par portefeuille). */
const MEMBERS = [
  member('u3', 'Zoé Bernard', { assigned_accounts: 9, open_actions: 4, overdue_actions: 2, period_activity: 12 }),
  member('u1', 'Alice Martin', {
    role: 'owner',
    assigned_accounts: 5,
    open_actions: 1,
    overdue_actions: 0,
    period_activity: 3,
  }),
  member('u2', 'Bob Durand', {
    assigned_accounts: 0,
    open_actions: 0,
    overdue_actions: 0,
    period_activity: 0,
    last_activity_at: null,
  }),
]

/** Le payload d'une API à jour, sur un espace qui a de quoi remplir chaque bloc. */
const FULL: ManagerTeamStats = {
  workspace: { id: 'w1', name: 'Skaizen', member_count: 3 },
  totals: { accounts: 12, contacts: 40, emails_sent: 5, analyses: 9 },
  pipeline: [{ status: 'new', count: 10 }],
  members: MEMBERS,
  coverage: { total_accounts: 12, assigned: 9, unassigned: 3 },
  unassigned_sample: [
    {
      id: 'a9',
      company_name: 'Carrefour',
      sector: 'Retail',
      priority_score: null,
      commercial_status: 'new',
      created_at: '2026-10-01T09:00:00.000Z',
    },
  ],
  duplicate_coverage: { accounts: [{ account_id: 'a2', company_name: 'TF1', rep_count: 2, reps: ['u1', 'u3'] }] },
  shared_actions: { open: 5, overdue: 2, delegated: 1, items: [] },
  period: { days: 7, since: '2026-10-07T00:00:00.000Z', previous_since: '2026-09-30T00:00:00.000Z' },
  pulse: {
    analyses: { current: 4, previous: 2 },
    actions_done: { current: 9, previous: 12 },
    meetings_declared: { current: 1, previous: 1 },
    active_accounts: { current: 6, previous: 4 },
    open_needs: { current: 2, previous: 0 },
  },
  pipeline_review: {
    inactivity_days: 14,
    stuck_days: 9,
    total: 1,
    counts: { no_next_step: 1, no_activity: 0, stuck: 1 },
    items: [
      {
        opportunity_id: 'o1',
        label: 'TMA SI RH',
        account_id: 'a5',
        company_name: 'Decathlon',
        stage: 'qualified',
        owner_user_id: 'u3',
        reasons: ['no_next_step', 'stuck'],
        stage_entered_at: '2026-09-01T00:00:00.000Z',
        last_activity_at: null,
      },
    ],
  },
  staffing: { open_needs: 3, available_now: 2, available_soon: 1 },
  pending_invitations: 2,
  awaiting_esn_profile: ['u2'],
  period_activity: {
    total: 2,
    items: [
      {
        id: 'e1',
        user_id: 'u3',
        action_type: 'rdv_obtained',
        account_id: 'a5',
        company_name: 'Decathlon',
        created_at: '2026-10-13T09:00:00.000Z',
      },
      {
        id: 'e2',
        user_id: 'u1',
        action_type: 'message_sent',
        account_id: 'a2',
        company_name: 'TF1',
        created_at: '2026-10-12T09:00:00.000Z',
      },
    ],
  },
}

/** Le même espace, sans RIEN à montrer dans les blocs de période. */
const EMPTY: ManagerTeamStats = {
  workspace: { id: 'w1', name: 'Skaizen', member_count: 1 },
  totals: { accounts: 0, contacts: 0, emails_sent: 0, analyses: 0 },
  pipeline: [],
  members: [member('u1', 'Alice Martin', { role: 'owner', assigned_accounts: 0 })],
  coverage: { total_accounts: 0, assigned: 0, unassigned: 0 },
  unassigned_sample: [],
  duplicate_coverage: { accounts: [] },
  shared_actions: { open: 0, overdue: 0, delegated: 0, items: [] },
  pipeline_review: {
    inactivity_days: 14,
    stuck_days: 9,
    total: 0,
    counts: { no_next_step: 0, no_activity: 0, stuck: 0 },
    items: [],
  },
  staffing: { open_needs: 0, available_now: 0, available_soon: 0 },
  pending_invitations: 0,
  awaiting_esn_profile: [],
  period_activity: { total: 0, items: [] },
}

const blocks = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-board-block]')).map(el => el.getAttribute('data-board-block'))

/** Où vit chaque bloc (Théo D, 23/10) : l'onglet et le sous-onglet de `/team` qui le montrent. */
const WHERE = {
  vue: '/team',
  objectifs: '/team?onglet=objectifs&sous=objectifs',
  affaires: '/team?onglet=objectifs&sous=affaires',
  portefeuilles: '/team?onglet=objectifs&sous=portefeuilles',
  plans: '/team?onglet=plans',
  journal: '/team?onglet=activite&sous=journal',
  echanges: '/team?onglet=activite&sous=echanges',
} as const

async function mount(stats: ManagerTeamStats, path: string = WHERE.vue) {
  useManagerStatsMock.mockReturnValue({ data: stats, isLoading: false, error: null })
  const view = renderWithRouter(<ManagerDashboardPage />, path)
  await screen.findByRole('heading', { level: 1 })
  return view
}

beforeEach(async () => {
  useManagerStatsMock.mockReset()
  vi.mocked(apiFetch).mockReset()
  vi.mocked(apiFetch).mockResolvedValue({})
  resetTestQueryClient()
  await i18n.changeLanguage('fr')
})

describe('#4158.37 — en-tête', () => {
  it('ne dit plus « Workspace commercial » ni « vue consolidée »', async () => {
    await mount(FULL)
    expect(screen.queryByText(/Workspace commercial/)).not.toBeInTheDocument()
    expect(screen.queryByText(/vue consolidée/)).not.toBeInTheDocument()
  })

  it('montre un avatar par membre, son nom lisible au focus (nom accessible)', async () => {
    await mount(FULL)
    const list = screen.getByRole('list', { name: 'Membres de l’équipe' })
    const avatars = within(list).getAllByRole('img')
    expect(avatars.map(a => a.getAttribute('aria-label'))).toEqual(['Alice Martin', 'Bob Durand', 'Zoé Bernard'])
    for (const avatar of avatars) expect(avatar).toHaveAttribute('tabindex', '0')
  })

  it('garde « Préparer ma revue d’équipe » (Laura) ; « Gérer les membres » est l’onglet Administration', async () => {
    await mount(FULL)
    // #4309.1 (lot LAURA, 19/10/2026) — sur bureau, l'amorce ouvre la bulle SUR PLACE : un bouton, plus un lien.
    expect(screen.getByRole('button', { name: /Préparer ma revue d’équipe/ })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Espaces de l’équipe' })
    expect(within(nav).getByRole('link', { name: 'Administration' })).toHaveAttribute('href', '/settings/team')
  })
})

describe('Théo D team-vue.R1 / N1 — en-tête et onglets', () => {
  it('« Équipe. », « Le pilotage collectif » au-dessus, la puce de rôle de celui qui lit', async () => {
    await mount(FULL)
    expect(screen.getByRole('heading', { level: 1, name: 'Équipe.' })).toBeInTheDocument()
    expect(screen.getByText('Le pilotage collectif')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Alice Martin · Propriétaire' })).toBeInTheDocument()
  })

  it('la puce de rôle ouvre « Une vue, pas un droit » : les parcours se comparent, aucun droit ne change', async () => {
    await mount(FULL)
    fireEvent.click(screen.getByRole('button', { name: 'Alice Martin · Propriétaire' }))
    const dialog = await screen.findByRole('dialog', { name: 'Une vue, pas un droit' })
    expect(within(dialog).getByText(/Changer de vue ne change pas tes droits/)).toBeInTheDocument()
    // Bob (commercial) n'ouvre pas l'espace Équipe ; Alice (propriétaire) l'ouvre : dit en mots.
    expect(within(dialog).getByText('Alice Martin (toi)')).toBeInTheDocument()
    expect(within(dialog).getAllByText('Ouvre l’espace Équipe').length).toBeGreaterThan(0)
    expect(within(dialog).getAllByText('N’ouvre pas l’espace Équipe').length).toBeGreaterThan(0)
  })

  it('« Préparer le point d’équipe » ouvre le parcours en trois étapes', async () => {
    await mount(FULL)
    expect(screen.getByRole('link', { name: 'Préparer le point d’équipe' })).toHaveAttribute('href', '/team/review/1')
  })

  it('la barre d’onglets ne liste que les écrans qui existent, la vue courante marquée', async () => {
    await mount(FULL)
    const nav = screen.getByRole('navigation', { name: 'Espaces de l’équipe' })
    expect(within(nav).getByRole('link', { name: 'Vue d’ensemble' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: /Objectifs & affaires/ })).not.toHaveAttribute('aria-current')
    expect(within(nav).getByRole('link', { name: /Plans & actions/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Activité & échanges/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Administration' })).toHaveAttribute('href', '/settings/team')
    // Recherches n'a pas d'écran : un onglet mort est pire qu'une absence.
    expect(within(nav).queryByRole('link', { name: 'Recherches' })).not.toBeInTheDocument()
  })

  it('les libellés des filtres (Portée, Objectifs) ne se coupent pas : une ligne entière, jamais tronquée (recette PR 12)', async () => {
    await mount(FULL)
    const filters = screen.getByRole('group', { name: 'Filtres de la page' })
    for (const name of ['Portée', 'Objectifs']) {
      const label = within(filters).getByText(name)
      expect(label.className).toContain('shrink-0')
      expect(label.className).toContain('whitespace-nowrap')
      expect(label).toHaveAttribute('title', name)
    }
  })

  it('« Plans & actions » porte le nombre d’actions ouvertes', async () => {
    await mount(FULL)
    const nav = screen.getByRole('navigation', { name: 'Espaces de l’équipe' })
    expect(within(nav).getByRole('link', { name: /Plans & actions/ })).toHaveTextContent('5')
  })

  it('un onglet sans écran (?onglet=recherches) retombe sur la vue d’ensemble', async () => {
    await mount(FULL, '/team?onglet=recherches')
    expect(screen.getByRole('heading', { level: 1, name: 'Équipe.' })).toBeInTheDocument()
  })

  it('le titre et la phrase suivent l’onglet', async () => {
    await mount(FULL, WHERE.journal)
    expect(screen.getByRole('heading', { level: 1, name: 'Ce qui avance, ce qui se discute.' })).toBeInTheDocument()
    expect(screen.getByText(/Pas de surveillance de présence/)).toBeInTheDocument()
  })

  it('les filtres de page : la portée (toute l’équipe) et le mois des objectifs', async () => {
    await mount(FULL)
    const filters = screen.getByRole('group', { name: 'Filtres de la page' })
    expect(within(filters).getByText('Portée')).toBeInTheDocument()
    expect(within(filters).getByText('Objectifs')).toBeInTheDocument()
    expect(within(filters).getByText('Toute l’équipe')).toBeInTheDocument()
  })
})

describe('Théo D — chaque sous-onglet est un vrai onglet, jamais des blocs empilés', () => {
  it('Objectifs & affaires : trois pastilles, une seule lecture à la fois', async () => {
    const { container } = await mount(FULL, WHERE.affaires)
    expect(screen.getByRole('button', { name: 'Revue des affaires' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Objectifs du mois' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Portefeuilles' })).toHaveAttribute('aria-pressed', 'false')
    expect(blocks(container)).toEqual(['pipeline-review'])
  })

  it('Activité & échanges : le journal d’un côté, les échanges de l’autre', async () => {
    const { container } = await mount(FULL, WHERE.journal)
    expect(screen.getByRole('button', { name: 'Journal d’activité' })).toHaveAttribute('aria-pressed', 'true')
    expect(blocks(container)).toEqual(['activity', 'details'])
    expect(screen.queryByRole('region', { name: 'Échanges d’équipe' })).not.toBeInTheDocument()
  })

  it('Vue d’ensemble et Plans & actions n’ont pas de second niveau', async () => {
    await mount(FULL)
    expect(screen.queryByRole('button', { name: 'Revue des affaires' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Journal d’activité' })).not.toBeInTheDocument()
  })
})

describe('#4158.37 / #4158.39 — UNE période pour toute la page, dans l’URL', () => {
  it('lit 7 j par défaut', async () => {
    await mount(FULL)
    expect(useManagerStatsMock).toHaveBeenLastCalledWith(7)
  })

  it('lit ?periode=30 depuis l’URL', async () => {
    await mount(FULL, '/team?periode=30')
    expect(useManagerStatsMock).toHaveBeenLastCalledWith(30)
  })

  it('une valeur trafiquée retombe sur 7 j', async () => {
    await mount(FULL, '/team?periode=14')
    expect(useManagerStatsMock).toHaveBeenLastCalledWith(7)
  })

  it('le sélecteur de période n’est proposé que là où la période compte (portefeuilles ; le journal a le sien)', async () => {
    await mount(FULL, WHERE.portefeuilles)
    const filters = screen.getByRole('group', { name: 'Filtres de la page' })
    expect(within(filters).getByText('Activité sur')).toBeInTheDocument()
  })

  it('…et absent de la vue d’ensemble', async () => {
    await mount(FULL)
    expect(screen.queryByText('Activité sur')).not.toBeInTheDocument()
  })
})

describe('Théo D team-vue — la vue d’ensemble, dans l’ordre de la maquette', () => {
  it('priorités → compteurs → [potentiel, qui porte quoi] | [regard de Laura, derniers mouvements]', async () => {
    const { container } = await mount(FULL)
    expect(blocks(container)).toEqual(['priorities', 'counters', 'who', 'glance', 'moves'])
  })

  it('deux colonnes indépendantes, comme `t8-content-grid` : Laura et les mouvements dans la colonne de droite', async () => {
    await mount(FULL)
    const main = screen.getByTestId('team-overview-main')
    const aside = screen.getByTestId('team-overview-aside')
    expect(main.querySelector('[data-board-block="who"]')).not.toBeNull()
    expect(main.querySelector('[data-board-block="glance"]')).toBeNull()
    expect(aside.querySelector('[data-board-block="glance"]')).not.toBeNull()
    expect(aside.querySelector('[data-board-block="moves"]')).not.toBeNull()
  })
})

describe('#4158 (complément BU) — « À traiter »', () => {
  it('fusionne arbitrages, doublons, invitations et collègues en attente, triés par urgence', async () => {
    await mount(FULL, WHERE.portefeuilles)
    const region = screen.getByRole('region', { name: 'À traiter' })
    const cards = within(region)
      .getAllByRole('article')
      .map(card => card.getAttribute('data-kind'))
    expect(cards).toEqual(['overdue', 'duplicate', 'awaiting-esn', 'unassigned', 'pending-invitations'])
    // Un doublon = UN compte, nommé, avec ceux qui le travaillent.
    expect(within(region).getByText(/TF1/)).toBeInTheDocument()
    expect(within(region).getByText(/Bob Durand attend/)).toBeInTheDocument()
    expect(within(region).getByRole('link', { name: /Voir les invitations/ })).toHaveAttribute('href', '/settings/team')
  })

  it('vide : UNE ligne discrète « Rien à arbitrer », pas un bloc', async () => {
    await mount(EMPTY, WHERE.portefeuilles)
    const region = screen.getByRole('region', { name: 'À traiter' })
    expect(within(region).queryAllByRole('article')).toHaveLength(0)
    expect(within(region).getByText('Rien à arbitrer.')).toBeInTheDocument()
  })

  it('Portefeuilles : la liste de Théo, puis (gardés) à traiter → pouls → par commercial → staffing', async () => {
    const { container } = await mount(FULL, WHERE.portefeuilles)
    expect(blocks(container)).toEqual(['portfolios', 'to-handle', 'pulse', 'reps', 'staffing'])
  })
})

describe('#4158.39 — « Pouls de l’équipe »', () => {
  it('cinq indicateurs comparés à la période précédente, chacun cliquable', async () => {
    await mount(FULL, WHERE.portefeuilles)
    const region = screen.getByRole('region', { name: 'Pouls de l’équipe' })
    const tiles = within(region).getAllByRole('link')
    expect(tiles).toHaveLength(5)
    // L'écart se lit en TEXTE (signe + nombre), jamais par une couleur seule.
    // analyses 4 vs 2, comptes actifs 6 vs 4, besoins 2 vs 0 : trois « +2 ».
    expect(within(region).getAllByText('+2 vs les 7 j précédents')).toHaveLength(3)
    expect(within(region).getByText('−3 vs les 7 j précédents')).toBeInTheDocument()
    expect(within(region).getAllByText('stable vs les 7 j précédents').length).toBeGreaterThan(0)
    // Le RDV est nommé DÉCLARÉ.
    expect(within(region).getByText(/RDV obtenus \(déclarés\)/)).toBeInTheDocument()
    expect(tiles[0]).toHaveAttribute('href', '/actions?category=analysis&period=7d')
  })

  it('absent (API plus ancienne) : aucune ligne', async () => {
    await mount(EMPTY, WHERE.portefeuilles)
    expect(screen.queryByRole('region', { name: 'Pouls de l’équipe' })).not.toBeInTheDocument()
  })
})

describe('#4158.40 — « Par commercial »', () => {
  it('six colonnes, triées par NOM, jamais par performance', async () => {
    await mount(FULL, WHERE.portefeuilles)
    const region = screen.getByRole('region', { name: 'Par commercial' })
    const table = within(region).getByRole('table')
    expect(within(table).getAllByRole('columnheader')).toHaveLength(6)
    const names = within(table)
      .getAllByRole('button', { name: /Voir le portefeuille de/ })
      .map(b => b.textContent)
    expect(names).toEqual(['Alice Martin', 'Bob Durand', 'Zoé Bernard'])
  })

  it('une ligne ouvre le portefeuille du membre', async () => {
    vi.mocked(apiFetch).mockImplementation(async (args: { path: string }) =>
      args.path === '/workspaces/members/u3/portfolio'
        ? {
            userId: 'u3',
            email: 'u3@esn.fr',
            fullName: 'Zoé Bernard',
            holdings: [{ kind: 'accounts', count: 9 }],
            personal: [],
            eligibleSuccessors: [],
          }
        : {},
    )
    await mount(FULL, WHERE.portefeuilles)
    const region = screen.getByRole('region', { name: 'Par commercial' })
    fireEvent.click(within(within(region).getByRole('table')).getByRole('button', { name: /Zoé Bernard/ }))
    expect(await screen.findByRole('dialog', { name: /Portefeuille de Zoé Bernard/ })).toBeInTheDocument()
    expect(await screen.findByText('Comptes portés')).toBeInTheDocument()
  })
})

describe('Théo D team-business — « Revue des affaires »', () => {
  it('le sous-onglet monte la table des affaires avec la revue du serveur (raisons et responsables)', async () => {
    await mount(FULL, WHERE.affaires)
    const region = screen.getByRole('region', { name: 'Revue des affaires (table)' })
    expect(within(region).getByText('TMA SI RH')).toBeInTheDocument()
  })
})

describe('#4158.42 — « Staffing »', () => {
  it('besoins ouverts face aux consultants disponibles, et la couverture', async () => {
    await mount(FULL, WHERE.portefeuilles)
    const region = screen.getByRole('region', { name: 'Staffing' })
    expect(
      within(region).getByRole('heading', { name: /3 besoins ouverts · 2 consultants disponibles/ }),
    ).toBeInTheDocument()
    expect(within(region).getByText(/Comptes par propriétaire/)).toBeInTheDocument()
    // Les doublons sont partis dans « À traiter ».
    expect(within(region).queryByText(/Doublons de couverture/)).not.toBeInTheDocument()
  })

  it('sans besoin, sans dispo, sans compte : aucune ligne', async () => {
    await mount(EMPTY, WHERE.portefeuilles)
    expect(screen.queryByRole('region', { name: 'Staffing' })).not.toBeInTheDocument()
  })
})

describe('#4158.43 — « Activité de l’équipe »', () => {
  it('fil de la période, filtrable par membre', async () => {
    await mount(FULL, WHERE.journal)
    const region = screen.getByRole('region', { name: 'Activité de l’équipe' })
    const facts = within(region).getAllByRole('article')
    expect(within(facts[0]).getByRole('heading', { name: /a décroché un rendez-vous/ })).toBeInTheDocument()
    expect(within(facts[0]).getByRole('link', { name: 'Decathlon' })).toBeInTheDocument()
    expect(within(region).getByRole('heading', { name: /a envoyé un message/ })).toBeInTheDocument()
    expect(within(region).getByRole('link', { name: 'TF1' })).toBeInTheDocument()
    // Théo : la période du journal vit dans SA barre d'outils, avec le type de fait.
    const toolbar = within(region).getByTestId('activity-toolbar')
    expect(within(toolbar).getByRole('group', { name: 'Type de fait' })).toBeInTheDocument()
    expect(within(toolbar).getByRole('combobox', { name: 'Période du journal' })).toBeInTheDocument()
    expect(within(region).getByRole('link', { name: /Journal d’administration/ })).toHaveAttribute(
      'href',
      '/settings/activity',
    )
  })

  it('vide sur la période : aucune ligne de fait, et la phrase qui le dit (jamais un onglet blanc)', async () => {
    await mount(EMPTY, WHERE.journal)
    const region = screen.getByRole('region', { name: 'Activité de l’équipe' })
    expect(within(region).queryAllByRole('article')).toHaveLength(0)
    expect(within(region).getByTestId('activity-empty')).toHaveTextContent(
      'Aucun fait enregistré sur les 7 derniers jours.',
    )
  })
})

describe('#4158.44 / #4158.45 — bas de page replié, retraits', () => {
  it('Adoption, hygiène Missions et contacts à traiter sont repliés sous le fil, puis la mention UE', async () => {
    await mount(FULL, WHERE.journal)
    for (const title of ['Adoption', 'Contacts à traiter']) {
      expect(screen.getByRole('button', { name: title })).toHaveAttribute('aria-expanded', 'false')
    }
    expect(screen.getByText(/hébergées dans l’Union européenne/)).toBeInTheDocument()
  })

  it('la section « Semaine » (agenda) est partie', async () => {
    await mount(
      {
        ...FULL,
        agenda: {
          window_days: 7,
          total: 1,
          items: [
            {
              id: 'r1',
              label: 'Relancer',
              account_id: 'a1',
              company_name: 'Acme',
              due_date: '2026-10-15',
              holder_user_id: 'u1',
            },
          ],
        },
      },
      WHERE.journal,
    )
    expect(screen.queryByRole('button', { name: 'Semaine' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Rappels & agenda/)).not.toBeInTheDocument()
  })

  it('le total « Analyses » n’est pas répété : il vit dans le pouls', async () => {
    await mount(FULL, WHERE.journal)
    fireEvent.click(screen.getByRole('button', { name: 'Adoption' }))
    const adoption = screen.getByRole('region', { name: 'Adoption' })
    expect(within(adoption).getByRole('link', { name: /Emails envoyés/ })).toBeInTheDocument()
    expect(within(adoption).queryByRole('link', { name: /^Analyses/ })).not.toBeInTheDocument()
  })
})
