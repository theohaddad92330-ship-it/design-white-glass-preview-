/**
 * Regression guard for the P1 prod outage of `/team`:
 *   `TypeError: Cannot read properties of undefined (reading 'unassigned')`
 *   at ManagerDashboardPage.tsx:61 — `data.coverage.unassigned`
 *
 * Mechanism (measured, not theorised): the web deploys on Vercel in ~1 min, the
 * API on Railway in several. The release that added account ownership shipped
 * `coverage` / `unassigned_sample` / `assigned_accounts` to the WEB while
 * `GET /version` in prod still reported the previous commit — an API that sends
 * none of them. `data.coverage` was `undefined`, the unguarded dereference threw
 * during render, and the whole screen fell to the root error boundary ("Oups.").
 *
 * Why the original suite was green: every test of this screen used an EMPTY
 * members array (or asserted on the API, which does return the fields). An empty
 * list never reaches the row-level reads, and the API-side tests exercise the
 * NEW server — neither can see a payload from an OLD one. The case that broke
 * prod is "populated rows from a server that predates the fields", so that is
 * the case pinned here.
 *
 * These tests FAIL on the pre-fix component (they throw) and pass once absence
 * is handled honestly — hidden sections and `—`, never a fabricated `0`.
 */
import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type ManagerTeamStats, managerTeamStatsSchema } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
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
  useManagerStats: () => useManagerStatsMock(),
}))
vi.mock('../hooks/useAssignAccount', () => ({
  useAssignAccount: () => ({ mutate: vi.fn(), isPending: false }),
}))
// Objectifs & commentaires d'équipe (§10) ont leurs propres requêtes : ici on les
// neutralise (aucune donnée → panneaux masqués) pour isoler le test deploy-skew.
// Leur comportement propre est couvert par ObjectivesPanel.test / TeamCommentsPanel.test.
vi.mock('../hooks/useObjectives', () => ({
  useTeamObjectives: () => ({ isSuccess: false, data: undefined }),
  useMyObjective: () => ({ isSuccess: false, data: undefined }),
  useUpsertMyObjective: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
}))
vi.mock('../hooks/useTeamComments', () => ({
  useTeamComments: () => ({ isSuccess: false, data: undefined }),
  useCreateTeamComment: () => ({ mutate: vi.fn(), isPending: false }),
}))
// Le cockpit lit l'utilisateur courant pour les onglets « mes actions » /
// « déléguées à moi ». Alice (u1) tient ce rôle dans tous les cas ci-dessous.
vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u1' }, loading: false }),
}))

/** Two real members — the populated case. An empty array proves nothing here. */
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
  {
    user_id: 'u2',
    name: 'Bob Durand',
    email: 'bob@esn.fr',
    role: 'sales' as const,
    accounts: 5,
    contacts: 10,
    emails_sent: 1,
    analyses: 3,
    last_activity_at: null,
  },
]

/** What the CURRENT API sends. */
const CURRENT: ManagerTeamStats = {
  workspace: { id: 'w1', name: 'Skaizen', member_count: 2 },
  totals: { accounts: 12, contacts: 40, emails_sent: 5, analyses: 9 },
  pipeline: [{ status: 'new', count: 10 }],
  members: MEMBERS.map((m, i) => ({ ...m, assigned_accounts: i === 0 ? 5 : 0, stale_accounts: i === 0 ? 1 : 0 })),
  coverage: { total_accounts: 12, assigned: 5, unassigned: 7 },
  unassigned_sample: [
    {
      id: 'a1',
      company_name: 'Doctolib',
      sector: 'Santé',
      priority_score: 88,
      commercial_status: 'new',
      created_at: '2026-07-18T10:00:00.000Z',
    },
  ],
}

/**
 * What the API deployed in prod ACTUALLY sent while the web was already new.
 * Cast because the compile-time type forbids it — the WIRE did not, which is
 * the entire bug.
 */
const OLD_API = {
  workspace: CURRENT.workspace,
  totals: CURRENT.totals,
  pipeline: CURRENT.pipeline,
  members: MEMBERS,
} as unknown as ManagerTeamStats

/** Cockpit fields (restitution V2 §9-10) : crédits par membre + doublons. */
const WITH_COCKPIT: ManagerTeamStats = {
  ...CURRENT,
  members: CURRENT.members.map((m, i) => ({ ...m, credits_consumed: i === 0 ? 42 : 7 })),
  duplicate_coverage: {
    accounts: [{ account_id: 'a2', company_name: 'TF1', rep_count: 2, reps: ['u1', 'u2'] }],
  },
}

/** Carte de couverture (restitution V2 §10) — trois axes, dont une zone blanche. */
const WITH_COVERAGE_MAP: ManagerTeamStats = {
  ...CURRENT,
  coverage_map: {
    sectors: [
      { label: 'Banque', total: 7, unassigned: 2, owners: [{ user_id: 'u1', count: 5 }] },
      { label: 'Retail', total: 3, unassigned: 3, owners: [] },
    ],
    territories: [{ label: 'Paris', total: 6, unassigned: 0, owners: [{ user_id: 'u2', count: 6 }] }],
    personas: [{ label: 'technical', total: 12, unassigned: 0, owners: [{ user_id: 'u1', count: 12 }] }],
  },
}

/**
 * Les blocs du cockpit de la maquette p.11 : file d'actions partagées, crédits
 * rapportés au quota du cycle, fil d'activité, rythme mensuel.
 */
const WITH_COCKPIT_BLOCKS: ManagerTeamStats = {
  ...CURRENT,
  shared_actions: {
    open: 9,
    overdue: 3,
    delegated: 4,
    items: [
      {
        id: 'act-1',
        label: 'Relancer le DSI',
        account_id: 'a1',
        company_name: 'Decathlon',
        due_date: '2026-07-10',
        overdue: true,
        owner_user_id: 'u1',
        assigned_to: 'u2',
      },
      {
        id: 'act-2',
        label: 'Préparer la soutenance',
        account_id: 'a2',
        company_name: 'Doctolib',
        due_date: null,
        overdue: false,
        owner_user_id: 'u2',
        assigned_to: 'u1',
      },
    ],
  },
  recent_activity: [
    {
      id: 'ev-1',
      user_id: 'u1',
      action_type: 'message_sent',
      account_id: 'a1',
      company_name: 'Decathlon',
      created_at: '2026-07-22T08:30:00.000Z',
    },
  ],
  credits: {
    period_start: '2026-07-01T00:00:00.000Z',
    credits: { used: 12, total: 40 },
    by_member: [
      { user_id: 'u1', credits: 28 },
      { user_id: 'u2', credits: 7 },
    ],
  },
  trend: {
    accounts: { current: 6, previous: 4 },
    contacts: { current: 20, previous: 25 },
    // Aucune base de comparaison : la tuile doit dire « rien le mois précédent »
    // plutôt qu'un pourcentage fabriqué.
    emails_sent: { current: 3, previous: 0 },
    analyses: { current: 0, previous: 0 },
  },
  // Rappels & agenda (bloc 7) : total 3 > 2 affichés → la troncature se dit. La
  // 1re échéance est déléguée à Bob (u2), la 2e portée par Alice (u1).
  agenda: {
    window_days: 7,
    total: 3,
    items: [
      {
        id: 'rem-1',
        label: 'Appeler la DSI',
        account_id: 'a1',
        company_name: 'Decathlon',
        due_date: '2026-07-24',
        holder_user_id: 'u2',
      },
      {
        id: 'rem-2',
        label: 'Envoyer la proposition',
        account_id: 'a2',
        company_name: 'Doctolib',
        due_date: '2026-07-26',
        holder_user_id: 'u1',
      },
    ],
  },
  // Playbooks partagés (bloc 11) : titre + catégorie + nature, jamais de taux.
  playbooks: {
    total: 2,
    items: [
      { id: 'pb-1', title: 'Séquence de prospection DSI', category: 'Prospection', kind: 'playbook' },
      { id: 'pb-2', title: 'Méthode MEDDIC', category: 'Qualification', kind: 'method_playbook' },
    ],
  },
}

/** Pipeline partagé valorisé (§10) : ne somme que des montants saisis, compte à part le reste. */
const WITH_PIPELINE_VALUE: ManagerTeamStats = {
  ...CURRENT,
  pipeline_value: {
    currency: 'EUR',
    total_amount: 80000,
    valued_count: 3,
    without_amount: 2,
    by_stage: [
      { stage: 'detected', amount: 30000, valued_count: 2, total_count: 3 },
      { stage: 'qualified', amount: 50000, valued_count: 1, total_count: 1 },
    ],
  },
}

/**
 * Le cockpit contient des liens (« Gérer les membres », le compte d'une action
 * partagée) : il lui faut un contexte Router. Celui-ci résout sa route au tick
 * suivant, d'où l'attente — un `getBy…` synchrone lirait un DOM encore vide.
 *
 * #4158 (lot L7, 14/10) — seul le DÉTAIL du bas se replie encore (Adoption,
 * hygiène Missions, contacts à traiter). Cette suite garde la SUBSTANCE de
 * chaque bloc (deploy skew, doublons, carte de couverture…) ; l'ordre et le
 * repli ont leurs propres suites (`.board.test.tsx`, `.collapsed.test.tsx`).
 * On ouvre donc le détail avant de lire, comme un manager qui déplie tout.
 */
/** Où vit chaque bloc (Théo D, 23/10) : l'onglet et le sous-onglet de `/team` qui le montrent. */
const WHERE = {
  vue: '/team',
  portefeuilles: '/team?onglet=objectifs&sous=portefeuilles',
  affaires: '/team?onglet=objectifs&sous=affaires',
  plans: '/team?onglet=plans',
  journal: '/team?onglet=activite&sous=journal',
} as const

async function mount(where: keyof typeof WHERE = 'vue') {
  renderWithRouter(<ManagerDashboardPage />, WHERE[where])
  await screen.findByRole('heading', { level: 1 })
  for (const toggle of screen.queryAllByRole('button')) {
    if (toggle.getAttribute('aria-expanded') === 'false' && toggle.getAttribute('aria-haspopup') !== 'dialog') {
      fireEvent.click(toggle)
    }
  }
}

describe('ManagerDashboardPage — survives a payload from an older API', () => {
  beforeEach(async () => {
    useManagerStatsMock.mockReset()
    await i18n.changeLanguage('fr')
  })

  it('renders the full screen when the API sends the ownership fields', async () => {
    useManagerStatsMock.mockReturnValue({ data: CURRENT, isLoading: false, error: null })
    await mount('portefeuilles')

    // Named twice on purpose: once in the members table, once as an option of
    // the to-assign dropdown.
    expect(screen.getAllByText('Alice Martin').length).toBeGreaterThan(0)
    // Coverage card + to-assign queue are both present.
    expect(screen.getAllByText(/Comptes par propriétaire/).length).toBeGreaterThan(0)
    expect(screen.getByText('Doctolib')).toBeInTheDocument()
  })

  it('#3544.3 — un effectif de pipeline se groupe par milliers (« 34896 » était illisible)', async () => {
    useManagerStatsMock.mockReturnValue({
      data: { ...CURRENT, pipeline: [{ status: 'new', count: 34896 }] },
      isLoading: false,
      error: null,
    })
    await mount('journal')

    expect(screen.getByText(/^34\s896$/)).toBeInTheDocument()
    expect(screen.queryByText('34896')).toBeNull()
  })

  // #4158 (complément BU) / #4158.40 — les doublons sont partis dans « À traiter » (une carte
  // PAR compte, nommé), la colonne Crédits dans « Adoption › Crédits & usage IA ».
  it('flags duplicate-covered accounts in « À traiter », one card per account (restitution V2 §10)', async () => {
    useManagerStatsMock.mockReturnValue({ data: WITH_COCKPIT, isLoading: false, error: null })
    await mount('portefeuilles')

    expect(screen.getByText('TF1 est travaillé par Alice Martin, Bob Durand')).toBeInTheDocument()
    // La table « Par commercial » n'a plus de colonne Crédits.
    expect(screen.queryByText('42')).not.toBeInTheDocument()
  })

  it('draws the coverage map and names the white spaces (restitution V2 §10)', async () => {
    useManagerStatsMock.mockReturnValue({ data: WITH_COVERAGE_MAP, isLoading: false, error: null })
    await mount('portefeuilles')

    expect(screen.getByText(/Carte de couverture/)).toBeInTheDocument()
    // Le secteur porté cite son responsable et son reliquat sans propriétaire.
    expect(screen.getByText('Banque')).toBeInTheDocument()
    expect(screen.getByText(/Alice Martin · 5/)).toBeInTheDocument()
    expect(screen.getByText(/2 comptes sans responsable/)).toBeInTheDocument()
    // Le secteur que personne ne porte est signalé comme zone blanche.
    expect(screen.getByText('Retail')).toBeInTheDocument()
    expect(screen.getByText(/Périmètre non couvert/)).toBeInTheDocument()
    // Persona traduit depuis la taxonomie MEDDIC, jamais affiché brut.
    expect(screen.getByText(/Technique/)).toBeInTheDocument()
    expect(screen.queryByText('technical')).not.toBeInTheDocument()
  })

  it('hides the coverage map when an older API omits it (absent ≠ « aucune couverture »)', async () => {
    useManagerStatsMock.mockReturnValue({ data: OLD_API, isLoading: false, error: null })
    await mount('portefeuilles')

    expect(screen.queryByText(/Carte de couverture/)).not.toBeInTheDocument()
  })

  it('makes no duplicate card when an older API omits the detection (absent ≠ « aucun doublon »)', async () => {
    useManagerStatsMock.mockReturnValue({ data: OLD_API, isLoading: false, error: null })
    await mount('portefeuilles')

    expect(screen.queryByText(/est travaillé par/)).not.toBeInTheDocument()
  })

  // THE regression: populated rows, no ownership fields. Pre-fix this threw.
  it('does NOT crash when coverage / unassigned_sample are absent', async () => {
    useManagerStatsMock.mockReturnValue({ data: OLD_API, isLoading: false, error: null })
    await mount('portefeuilles')

    // Un rendu qui aurait explosé laisserait le DOM vide : la présence des
    // lignes membres est la preuve que l'écran a bien tenu.
    expect(screen.getAllByText('Alice Martin').length).toBeGreaterThan(0)
  })

  it('still renders the members and totals the old API DID send', async () => {
    useManagerStatsMock.mockReturnValue({ data: OLD_API, isLoading: false, error: null })
    await mount('portefeuilles')

    // Table (≥ 768 px) ET cartes (< 768 px) : deux rendus du même membre.
    expect(screen.getAllByText('Alice Martin').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Bob Durand').length).toBeGreaterThan(0)
    // A role from the full RBAC set is translated, not dumped raw.
    expect(screen.getAllByText(/Commercial/).length).toBeGreaterThan(0)
  })

  it('#2405.8 — un siège sans activité nomme une cause technique avant de conclure au désengagement', async () => {
    // Bob (CURRENT) : last_activity_at null, assigned_accounts 0 — aucun
    // portefeuille encore attribué, pas encore un jugement sur la personne.
    useManagerStatsMock.mockReturnValue({ data: CURRENT, isLoading: false, error: null })
    await mount('portefeuilles')

    expect(screen.getAllByText('Aucun compte attribué').length).toBeGreaterThan(0)
    // Alice, elle, a une date réelle : aucune cause ne s'affiche pour elle.
    expect(screen.queryByText('Rôle lecture seule')).not.toBeInTheDocument()
  })

  it('hides the coverage card and the to-assign queue rather than zeroing them', async () => {
    useManagerStatsMock.mockReturnValue({ data: OLD_API, isLoading: false, error: null })
    await mount('portefeuilles')

    expect(screen.queryByText(/Comptes par propriétaire/)).not.toBeInTheDocument()
    expect(screen.queryByText(/À attribuer/)).not.toBeInTheDocument()
    // No fabricated "0 / 0 comptes attribués" anywhere.
    expect(screen.queryByText(/comptes attribués/)).not.toBeInTheDocument()
  })

  it('shows the per-member portfolio as unknown (—), never as 0', async () => {
    useManagerStatsMock.mockReturnValue({ data: OLD_API, isLoading: false, error: null })
    await mount('portefeuilles')

    // Two members × (portefeuille + en veille) = 4 unknown cells.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4)
  })

  // ─── Blocs du cockpit (maquette p.11) ───────────────────────────────────────

  it('renders the shared action queue with its full counters and overdue badge', async () => {
    useManagerStatsMock.mockReturnValue({ data: WITH_COCKPIT_BLOCKS, isLoading: false, error: null })
    await mount('plans')

    expect(screen.getByText(/Actions à traiter/)).toBeInTheDocument()
    // Le dénominateur porte sur la file complète, pas sur l'échantillon.
    expect(screen.getByText(/9 ouvertes · 3 en retard · 4 déléguées/)).toBeInTheDocument()
    // Théo D team-vue.R2 — la carte « 1 action à reprendre » répète le libellé : on lit la FILE.
    const queue = within(document.getElementById('team-shared-actions') as HTMLElement)
    expect(queue.getByText('Relancer le DSI')).toBeInTheDocument()
    expect(screen.getByText('En retard')).toBeInTheDocument()
    // La troncature se dit, sinon « 2 actions » ferait croire à une équipe à jour.
    expect(screen.getByText(/la file en compte 9/)).toBeInTheDocument()
  })

  it('filters the shared queue down to actions delegated to the current user', async () => {
    useManagerStatsMock.mockReturnValue({ data: WITH_COCKPIT_BLOCKS, isLoading: false, error: null })
    await mount('plans')

    // u1 est l'utilisateur courant : « Relancer le DSI » est déléguée à u2, elle
    // doit donc disparaître de l'onglet « déléguées à moi ».
    fireEvent.click(screen.getByRole('button', { name: 'Déléguées à moi' }))
    const queue = within(document.getElementById('team-shared-actions') as HTMLElement)
    expect(queue.queryByText('Relancer le DSI')).not.toBeInTheDocument()
    expect(queue.getByText('Préparer la soutenance')).toBeInTheDocument()
  })

  it('shows NO credit consumption to the manager — no quota gauge, no per-member credits (#4463)', async () => {
    // Le payload porte encore `credits` et la ventilation par membre : l'écran ne les lit plus.
    // La consommation ne se lit qu'au back-office (apps/dashboard-manager).
    useManagerStatsMock.mockReturnValue({ data: WITH_COCKPIT_BLOCKS, isLoading: false, error: null })
    await mount('plans')

    // Le tableau de bord est bien rendu (sinon l'absence ne prouverait rien).
    expect(screen.getByText('Préparer la soutenance')).toBeInTheDocument()
    expect(screen.queryByText(/Crédits & usage IA/)).not.toBeInTheDocument()
    expect(screen.queryByText('12 / 40 utilisés')).not.toBeInTheDocument()
    expect(screen.queryByText('28 crédits')).not.toBeInTheDocument()
    expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Enrichissements/)).not.toBeInTheDocument()
  })

  // #4158.43 — le fil lit désormais la PÉRIODE (`period_activity`), plus la tête
  // tout-temps (`recent_activity`, encore servie, plus lue par l'écran).
  it('renders the period activity feed with translated event labels', async () => {
    useManagerStatsMock.mockReturnValue({
      data: {
        ...WITH_COCKPIT_BLOCKS,
        period_activity: { total: 1, items: WITH_COCKPIT_BLOCKS.recent_activity ?? [] },
      },
      isLoading: false,
      error: null,
    })
    await mount('journal')

    expect(screen.getByRole('region', { name: 'Activité de l’équipe' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /a envoyé un message/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Decathlon' })).toBeInTheDocument()
  })

  it('puts a rhythm under each total instead of a bare cumulative figure', async () => {
    useManagerStatsMock.mockReturnValue({ data: WITH_COCKPIT_BLOCKS, isLoading: false, error: null })
    await mount('journal')

    // 6 ce mois-ci contre 4 le mois précédent = +50 %.
    expect(screen.getByText(/6 ce mois-ci/)).toBeInTheDocument()
    expect(screen.getByText(/\+50 % vs mois précédent/)).toBeInTheDocument()
    // Base de comparaison nulle ⇒ AUCUN pourcentage inventé.
    expect(screen.getByText(/rien le mois précédent/)).toBeInTheDocument()
  })

  // #4158.45 — la section « Semaine » est partie : l'agenda vit dans `/agenda`,
  // le sélecteur de période la remplace ici. L'API sert encore `agenda`.
  it('no longer renders the team agenda on this screen (#4158.45)', async () => {
    useManagerStatsMock.mockReturnValue({ data: WITH_COCKPIT_BLOCKS, isLoading: false, error: null })
    await mount('journal')

    expect(screen.queryByText(/Rappels & agenda/)).not.toBeInTheDocument()
    expect(screen.queryByText('Appeler la DSI')).not.toBeInTheDocument()
  })

  it('surfaces shared playbooks with a Knowledge link and never a fabricated success rate (bloc 11)', async () => {
    useManagerStatsMock.mockReturnValue({ data: WITH_COCKPIT_BLOCKS, isLoading: false, error: null })
    await mount('journal')

    expect(screen.getByText(/Playbooks partagés/)).toBeInTheDocument()
    expect(screen.getByText('Séquence de prospection DSI')).toBeInTheDocument()
    // La nature est traduite (« Méthode »), jamais affichée brute.
    expect(screen.getByText(/Méthode · Qualification/)).toBeInTheDocument()
    expect(screen.queryByText('method_playbook')).not.toBeInTheDocument()
    // Aucun taux de réussite : la donnée n'existe pas, on ne l'invente pas.
    expect(screen.queryByText(/réussite/i)).not.toBeInTheDocument()
    // Un lien renvoie vers l'écran qui édite les playbooks.
    expect(screen.getByText(/Ouvrir les Connaissances/)).toBeInTheDocument()
  })

  it('values the shared pipeline, summing only entered amounts and counting the rest apart (§10)', async () => {
    useManagerStatsMock.mockReturnValue({ data: WITH_PIPELINE_VALUE, isLoading: false, error: null })
    await mount('affaires')

    expect(screen.getByText(/Pipeline partagé/)).toBeInTheDocument()
    // Total = somme des montants SAISIS (30 000 + 50 000), formaté en euros.
    expect(screen.getByText(/80\s?000/)).toBeInTheDocument()
    // Les opportunités sans montant sont annoncées à part, jamais sommées à 0 €.
    expect(screen.getByText(/2 opportunités sans montant/)).toBeInTheDocument()
  })

  it('hides every cockpit block an older API omits (absent ≠ « rien à traiter »)', async () => {
    useManagerStatsMock.mockReturnValue({ data: OLD_API, isLoading: false, error: null })
    await mount('journal')

    expect(screen.queryByText(/Actions à traiter/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Crédits & usage IA/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Activité de l’équipe/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ce mois-ci/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Rappels & agenda/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Playbooks partagés/)).not.toBeInTheDocument()
    // Le pipeline valorisé se masque aussi quand l'API ne l'envoie pas.
    expect(screen.queryByText(/Pipeline partagé/)).not.toBeInTheDocument()
  })

  it('states where the team data is hosted', async () => {
    useManagerStatsMock.mockReturnValue({ data: CURRENT, isLoading: false, error: null })
    await mount('vue')

    expect(screen.getByText(/hébergées dans l’Union européenne/)).toBeInTheDocument()
  })
})

describe('managerTeamStatsSchema — the contract models the deploy window', () => {
  it('accepts a payload from an API that predates account ownership', () => {
    expect(() => managerTeamStatsSchema.parse(OLD_API)).not.toThrow()
  })

  it('accepts the current payload and keeps the ownership fields', () => {
    const parsed = managerTeamStatsSchema.parse(CURRENT)
    expect(parsed.coverage?.unassigned).toBe(7)
    expect(parsed.unassigned_sample).toHaveLength(1)
    expect(parsed.members[0]?.assigned_accounts).toBe(5)
  })

  /**
   * Optional is not "anything goes": a payload missing a field the screen truly
   * cannot work without still fails AT THE FETCH, where the error names the
   * field — instead of surfacing as a dead page three components deeper.
   */
  it('still rejects a payload missing a genuinely required field', () => {
    const { members: _dropped, ...withoutMembers } = OLD_API
    expect(() => managerTeamStatsSchema.parse(withoutMembers)).toThrow(/members/)
  })
})
