/**
 * Théo D team-vue — la vue d'ensemble de l'équipe : le cap, les trois
 * priorités, les compteurs de stock, qui porte quoi, le regard de Laura et les
 * derniers mouvements. Chaque bloc sans donnée ne fait AUCUNE ligne : une
 * absence n'est jamais « 0 ».
 */
import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagerMemberStats, ManagerTeamStats, TeamObjectives } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TeamCap, TeamCounters, TeamLastMoves, TeamLauraGlance, TeamPriorities, TeamWhoCarries } from './TeamBoardTheo'

const teamObjectives = vi.fn()
vi.mock('../../hooks/useObjectives', () => ({
  useTeamObjectives: () => teamObjectives(),
}))

const member = (user_id: string, name: string, extra: Partial<ManagerMemberStats> = {}): ManagerMemberStats => ({
  user_id,
  name,
  email: `${user_id}@esn.fr`,
  role: 'sales',
  accounts: 1,
  contacts: 1,
  emails_sent: 0,
  analyses: 0,
  last_activity_at: null,
  ...extra,
})

const MEMBERS = [
  member('u1', 'Maëlle Lorquin', { assigned_accounts: 8, opportunities: 4, open_actions: 5, overdue_actions: 1 }),
  member('u2', 'Léa Marchand', { assigned_accounts: 5, opportunities: 3, open_actions: 4, overdue_actions: 0 }),
]

const DATA: ManagerTeamStats = {
  workspace: { id: 'w', name: 'Skaizen', member_count: 2 },
  totals: { accounts: 13, contacts: 40, emails_sent: 0, analyses: 0 },
  pipeline: [],
  members: MEMBERS,
  shared_actions: {
    open: 9,
    overdue: 1,
    delegated: 0,
    items: [
      {
        id: 't1',
        label: 'Obtenir le bon de commande avant le démarrage',
        account_id: 'a1',
        company_name: 'Renault',
        due_date: '2026-10-10',
        overdue: true,
        owner_user_id: 'u1',
        assigned_to: null,
      },
    ],
  } as ManagerTeamStats['shared_actions'],
  pipeline_value: {
    currency: 'EUR',
    total_amount: 417000,
    valued_count: 7,
    without_amount: 0,
    by_stage: [
      { stage: 'qualified', amount: 97000, valued_count: 2, total_count: 2 },
      { stage: 'proposal', amount: 320000, valued_count: 5, total_count: 5 },
    ],
  } as ManagerTeamStats['pipeline_value'],
  pipeline_review: {
    inactivity_days: 14,
    stuck_days: 21,
    total: 2,
    counts: { no_next_step: 1, no_activity: 0, stuck: 1 },
    items: [
      {
        opportunity_id: 'o1',
        label: 'Mission IAM',
        account_id: 'a2',
        company_name: 'Société Générale',
        stage: 'proposal',
        owner_user_id: 'u1',
        reasons: ['stuck'],
        stage_entered_at: '2026-09-01T00:00:00.000Z',
        last_activity_at: null,
      },
      {
        opportunity_id: 'o2',
        label: 'Confirmer le périmètre et le budget',
        account_id: 'a3',
        company_name: 'EDF',
        stage: 'qualified',
        owner_user_id: 'u2',
        reasons: ['no_next_step'],
        stage_entered_at: '2026-10-01T00:00:00.000Z',
        last_activity_at: null,
      },
    ],
  } as ManagerTeamStats['pipeline_review'],
  period_activity: {
    total: 4,
    items: [
      {
        id: 'e1',
        user_id: 'u1',
        action_type: 'deal_signed',
        account_id: 'a9',
        company_name: 'Groupe BPCE',
        created_at: '2026-10-19T11:31:00.000Z',
      },
      {
        id: 'e2',
        user_id: 'u2',
        action_type: 'analysis_completed',
        account_id: null,
        company_name: null,
        created_at: '2026-10-19T09:12:00.000Z',
      },
      {
        id: 'e3',
        user_id: 'u2',
        action_type: 'message_sent',
        account_id: 'a2',
        company_name: 'Société Générale',
        created_at: '2026-10-19T08:20:00.000Z',
      },
      {
        id: 'e4',
        user_id: 'u1',
        action_type: 'message_sent',
        account_id: 'a2',
        company_name: 'Société Générale',
        created_at: '2026-10-18T08:20:00.000Z',
      },
    ],
  } as ManagerTeamStats['period_activity'],
}

const BARE: ManagerTeamStats = {
  workspace: { id: 'w', name: 'Skaizen', member_count: 2 },
  totals: { accounts: 0, contacts: 0, emails_sent: 0, analyses: 0 },
  pipeline: [],
  members: [member('u1', 'Maëlle Lorquin'), member('u2', 'Léa Marchand')],
}

beforeEach(async () => {
  teamObjectives.mockReset()
  teamObjectives.mockReturnValue({ isSuccess: false, data: undefined })
  await i18n.changeLanguage('fr')
})

const progress = (
  user_id: string,
  revenueTarget: number | null,
  revenueAchieved: number,
): TeamObjectives['members'][number] =>
  ({
    user_id,
    period_month: '2026-10',
    targets: { meetings: null, accounts: null, revenue: revenueTarget },
    achieved: { meetings: 0, accounts: 0, revenue: revenueAchieved },
  }) as TeamObjectives['members'][number]

describe('Théo D team-vue.R5 — « Le cap »', () => {
  it('somme le signé et les cibles déclarées, dit le taux et le reste à signer', async () => {
    teamObjectives.mockReturnValue({
      isSuccess: true,
      data: { period_month: '2026-10', members: [progress('u1', 90000, 71000), progress('u2', 60000, 0)] },
    })
    renderWithRouter(<TeamCap members={MEMBERS} />)
    const region = await screen.findByRole('region', { name: 'Le cap du mois' })
    expect(within(region).getByText(/71\s000\s€/)).toBeInTheDocument()
    expect(within(region).getByText(/150\s000\s€/)).toBeInTheDocument()
    expect(within(region).getByText('47 % de la cible')).toBeInTheDocument()
    expect(within(region).getByText(/79\s000\s€ restent à signer/)).toBeInTheDocument()
    expect(within(region).getByText('2 / 2 contributeurs avec une cible')).toBeInTheDocument()
  })

  it('l’aide « ? » ouvre la définition du cap et dit que le taux ne prédit rien', async () => {
    teamObjectives.mockReturnValue({
      isSuccess: true,
      data: { period_month: '2026-10', members: [progress('u1', 90000, 71000)] },
    })
    renderWithRouter(<TeamCap members={MEMBERS} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Comment se lit le cap commercial' }))
    const dialog = await screen.findByRole('dialog', { name: 'Le cap commercial' })
    expect(within(dialog).getByText(/Un montant absent n’est pas transformé en zéro/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Il ne prédit pas les prochains gains/)).toBeInTheDocument()
  })

  it('« Détail » mène aux objectifs ; il disparaît dans l’onglet des objectifs lui-même', async () => {
    teamObjectives.mockReturnValue({
      isSuccess: true,
      data: { period_month: '2026-10', members: [progress('u1', 90000, 71000)] },
    })
    const { unmount } = renderWithRouter(<TeamCap members={MEMBERS} />)
    expect(await screen.findByRole('link', { name: /Détail/ })).toHaveAttribute('href', '/team?onglet=objectifs')
    unmount()
    renderWithRouter(<TeamCap members={MEMBERS} detail={false} />)
    await screen.findByRole('region', { name: 'Le cap du mois' })
    expect(screen.queryByRole('link', { name: /Détail/ })).not.toBeInTheDocument()
  })

  it('aucune cible chiffrée : aucune ligne, jamais 0 %', async () => {
    teamObjectives.mockReturnValue({
      isSuccess: true,
      data: { period_month: '2026-10', members: [progress('u1', null, 0)] },
    })
    renderWithRouter(<TeamCap members={MEMBERS} />)
    expect(screen.queryByRole('region', { name: 'Le cap du mois' })).not.toBeInTheDocument()
  })

  it('la lecture n’a pas abouti : aucune ligne', async () => {
    renderWithRouter(<TeamCap members={MEMBERS} />)
    expect(screen.queryByRole('region', { name: 'Le cap du mois' })).not.toBeInTheDocument()
  })
})

describe('Théo D team-vue.R2 — « Là où tu peux aider »', () => {
  it('trois cartes à trois verbes, chacune avec son « Pourquoi »', async () => {
    renderWithRouter(<TeamPriorities data={DATA} />)
    const region = await screen.findByRole('region', { name: 'Là où tu peux aider' })
    const cards = within(region).getAllByRole('article')
    expect(cards).toHaveLength(3)
    expect(within(cards[0]).getByText('1 action à reprendre')).toBeInTheDocument()
    expect(within(cards[0]).getByRole('link', { name: 'Replanifier' })).toHaveAttribute('href', '/accounts/a1')
    expect(within(cards[1]).getByText('Société Générale')).toBeInTheDocument()
    expect(within(cards[1]).getByRole('link', { name: 'Revoir la suite' })).toHaveAttribute('href', '/accounts/a2')
    expect(within(cards[2]).getByText('Une affaire sans action datée')).toBeInTheDocument()
    expect(within(cards[2]).getByRole('link', { name: 'Créer la prochaine action' })).toHaveAttribute(
      'href',
      '/accounts/a3',
    )
  })

  it('la couleur dit l’état : à reprendre en rouge doux, opportunité en accent, sans date en ambre', async () => {
    renderWithRouter(<TeamPriorities data={DATA} />)
    const region = await screen.findByRole('region', { name: 'Là où tu peux aider' })
    const tones = within(region)
      .getAllByRole('article')
      .map(card => card.querySelector('[data-tone]')?.className ?? '')
    expect(tones[0]).toContain('--danger-soft-bg')
    expect(tones[1]).toContain('--accent-soft-bg')
    expect(tones[2]).toContain('--warning-soft-bg')
  })

  it('« Pourquoi » déplie la raison, sans rien envoyer', async () => {
    renderWithRouter(<TeamPriorities data={DATA} />)
    const region = await screen.findByRole('region', { name: 'Là où tu peux aider' })
    const why = within(region).getAllByRole('button', { name: 'Pourquoi' })[0]
    expect(why).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(why)
    expect(why).toHaveAttribute('aria-expanded', 'true')
    expect(within(region).getByText(/échéance est dépassée/)).toBeInTheDocument()
  })

  it('rien à reprendre : aucune ligne', async () => {
    renderWithRouter(<TeamPriorities data={BARE} />)
    expect(screen.queryByRole('region', { name: 'Là où tu peux aider' })).not.toBeInTheDocument()
  })
})

describe('Théo D team-vue.R3 — compteurs de stock', () => {
  it('actions à faire (dont en retard), affaires à suivre, sujets partagés — sans comparaison', async () => {
    renderWithRouter(<TeamCounters data={DATA} sharedTopics={1} />)
    const region = await screen.findByRole('region', { name: 'Compteurs de l’équipe' })
    const tiles = within(region).getAllByRole('listitem')
    expect(tiles).toHaveLength(3)
    expect(within(tiles[0]).getByText('Actions à faire')).toBeInTheDocument()
    expect(within(tiles[0]).getByText('9')).toBeInTheDocument()
    expect(within(tiles[0]).getByText('Dont 1 en retard')).toBeInTheDocument()
    expect(within(tiles[1]).getByText('Affaires à suivre')).toBeInTheDocument()
    expect(within(tiles[1]).getByText('7')).toBeInTheDocument()
    expect(within(tiles[1]).getByText('Le détail, pas un score de productivité')).toBeInTheDocument()
    expect(within(tiles[2]).getByText('Sujets partagés')).toBeInTheDocument()
  })

  it('chaque tuile mène à l’onglet qui détaille son chiffre', async () => {
    renderWithRouter(<TeamCounters data={DATA} sharedTopics={1} />)
    const region = await screen.findByRole('region', { name: 'Compteurs de l’équipe' })
    const links = within(region).getAllByRole('link')
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '/team?onglet=plans',
      '/team?onglet=objectifs&sous=affaires',
      '/team?onglet=activite&sous=echanges',
    ])
  })

  it('aucun retard : « Aucun retard enregistré » ; une valeur inconnue ne fait pas de tuile', async () => {
    const data = { ...DATA, shared_actions: { ...DATA.shared_actions!, overdue: 0 } }
    renderWithRouter(<TeamCounters data={data} sharedTopics={undefined} />)
    const region = await screen.findByRole('region', { name: 'Compteurs de l’équipe' })
    expect(within(region).getByText('Aucun retard enregistré')).toBeInTheDocument()
    expect(within(region).queryByText('Sujets partagés')).not.toBeInTheDocument()
  })

  it('aucune donnée : aucune ligne', async () => {
    renderWithRouter(<TeamCounters data={BARE} sharedTopics={undefined} />)
    expect(screen.queryByRole('region', { name: 'Compteurs de l’équipe' })).not.toBeInTheDocument()
  })
})

describe('Théo D team-vue.R4 — « Qui porte quoi »', () => {
  it('une ligne par personne, triée par nom, sans classement, chacune mène au portefeuille', async () => {
    renderWithRouter(<TeamWhoCarries members={[...MEMBERS].reverse()} />)
    const region = await screen.findByRole('region', { name: 'Qui porte quoi' })
    expect(within(region).getByText('La répartition du travail, sans classement des personnes.')).toBeInTheDocument()
    const cards = within(region).getAllByRole('listitem')
    expect(within(cards[0]).getByRole('link')).toHaveAttribute('href', '/team?onglet=objectifs&sous=portefeuilles')
    expect(within(region).getByRole('link', { name: /Les portefeuilles/ })).toBeInTheDocument()
    expect(cards.map(card => within(card).getByRole('heading', { level: 3 }).textContent)).toEqual([
      'Léa Marchand',
      'Maëlle Lorquin',
    ])
    expect(within(cards[1]).getByText('5 actions ouvertes')).toBeInTheDocument()
    expect(within(cards[1]).getByText('1 en retard')).toBeInTheDocument()
    expect(within(cards[0]).getByText('Aucun retard enregistré')).toBeInTheDocument()
  })

  it('un compteur inconnu n’est pas écrit 0', async () => {
    renderWithRouter(<TeamWhoCarries members={[member('u9', 'Zoé Bernard')]} />)
    const card = (await screen.findAllByRole('listitem'))[0]
    expect(within(card).getAllByText('—').length).toBeGreaterThan(0)
    expect(within(card).queryByText('0')).not.toBeInTheDocument()
  })
})

describe('Théo D team-vue.R7 — « Le regard de Laura »', () => {
  it('phrase gabaritée sans coût : commence par lever le blocage quand une action est en retard', async () => {
    renderWithRouter(<TeamLauraGlance data={DATA} />)
    const region = await screen.findByRole('region', { name: 'Le regard de Laura' })
    expect(within(region).getByText('Commence par lever le blocage.')).toBeInTheDocument()
    expect(within(region).getByRole('link', { name: 'Préparer les arbitrages' })).toHaveAttribute(
      'href',
      '/team/review/1',
    )
  })

  it('rien en retard, une affaire à relancer : la phrase suit l’affaire', async () => {
    const data = { ...DATA, shared_actions: { ...DATA.shared_actions!, overdue: 0 } }
    renderWithRouter(<TeamLauraGlance data={data} />)
    expect(await screen.findByText('Relance les affaires sans suite.')).toBeInTheDocument()
  })

  it('rien à lire : aucune ligne', async () => {
    renderWithRouter(<TeamLauraGlance data={BARE} />)
    expect(screen.queryByRole('region', { name: 'Le regard de Laura' })).not.toBeInTheDocument()
  })
})

describe('Théo D team-vue.R6 — « Derniers mouvements »', () => {
  it('trois lignes au plus, la société en lien, « Tout voir » vers le fil', async () => {
    renderWithRouter(<TeamLastMoves data={DATA} />)
    const region = await screen.findByRole('region', { name: 'Derniers mouvements' })
    expect(within(region).getAllByRole('article')).toHaveLength(3)
    expect(within(region).getByRole('link', { name: 'Groupe BPCE' })).toHaveAttribute('href', '/accounts/a9')
    expect(within(region).getByRole('link', { name: 'Tout voir' })).toHaveAttribute(
      'href',
      '/team?onglet=activite&sous=journal',
    )
  })

  it('aucun mouvement : aucune ligne', async () => {
    renderWithRouter(<TeamLastMoves data={BARE} />)
    expect(screen.queryByRole('region', { name: 'Derniers mouvements' })).not.toBeInTheDocument()
  })
})
