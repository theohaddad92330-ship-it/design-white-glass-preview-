import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account, ProjectRow } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabNeeds } from './TabNeeds'

/**
 * #2150.39 — « Besoin > Contacts client », la porte vers l'annuaire canonique.
 *
 * Chaque besoin confirmé (`TabNeeds`) porte déjà une action de navigation
 * (« Ouvrir dans le pipe »). Celle-ci s'ajoute — elle ne la remplace pas —
 * et réutilise le SEUL filtre déjà posé par l'annuaire (`company`, ILIKE,
 * `routes/contacts/index.tsx`) : aucune route dédiée, aucun paramètre neuf.
 */
let PROJECTS_FAIL = false
const mockFetch = vi.fn((args: { path: string; method?: string; body?: unknown }) => {
  if (args.path.startsWith('/projects?'))
    return PROJECTS_FAIL ? Promise.reject(new Error('down')) : Promise.resolve(ROWS)
  if (args.path.startsWith('/projects/needs?')) return Promise.resolve({ data: NEEDS, total: NEEDS.length })
  if (args.path === '/workspaces/members') return Promise.resolve([])
  return Promise.resolve(null)
})
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: [{ path: string; method?: string; body?: unknown }]) => mockFetch(...args),
}))

let ACCOUNT = { id: 'acc-1', company_name: 'Acme', signals_collected_at: '2026-10-01T00:00:00Z' } as Account

let ROWS: ProjectRow[] = []
let NEEDS: Array<Record<string, unknown>> = []

const need = (over: Record<string, unknown> = {}) => ({
  id: 'need-1',
  account_id: 'acc-1',
  title: 'Architecte data senior',
  location: 'Lyon',
  headcount: 2,
  contract_kind: 'regie',
  status: 'open',
  deadline_at: '2026-10-20T00:00:00.000Z',
  start_on: null,
  ...over,
})

const row = (over: Partial<ProjectRow> = {}): ProjectRow =>
  ({
    id: 'p-1',
    account_id: 'acc-1',
    company_name: 'Acme',
    sector: null,
    logo_url: null,
    website: null,
    kind: 'program',
    label: 'Migration ERP',
    detail: null,
    offer: null,
    source: null,
    confidence: null,
    urgency: null,
    stage: 'confirmed',
    stage_entered_at: new Date().toISOString(),
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    access_mode: null,
    loss_reason: null,
    first_detected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    amount_cents: null,
    has_mission: false,
    ...over,
  }) as ProjectRow

async function mount(rows: ProjectRow[]) {
  mockFetch.mockClear()
  PROJECTS_FAIL = false
  ROWS = rows
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  renderWithRouter(
    <QueryClientProvider client={client}>
      <TabNeeds account={ACCOUNT} />
    </QueryClientProvider>,
  )
  await screen.findByTestId('linked-objects-summary-confirmed')
}

describe('TabNeeds — la nature de la ligne (#3676.6)', () => {
  it('chaque besoin confirmé se dit « Demande confirmée »', async () => {
    await mount([row()])
    expect(await screen.findByText('Demande confirmée', { selector: 'span,div' })).toBeInTheDocument()
  })
})

describe('TabNeeds — porte « Contacts client » (#2150.39)', () => {
  it('propose « Contacts client », un lien vers l’annuaire filtré sur le compte du besoin', async () => {
    await mount([row()])
    const link = await screen.findByRole('link', { name: 'Contacts client' })
    expect(link).toHaveAttribute('href', '/contacts?company=Acme')
  })

  it('garde l’action « Ouvrir dans le Pipe » — Contacts client s’AJOUTE, ne remplace rien', async () => {
    await mount([row()])
    // #3676 — le lien ouvre l'OBJET (`/projects/$id`), plus le pipe générique.
    expect(await screen.findByRole('link', { name: 'Ouvrir dans le Pipe' })).toHaveAttribute(
      'href',
      '/projects/p-1?from=account&fromId=acc-1&fromTab=veille',
    )
  })
})

/**
 * #2777 — un besoin SANS PROJET (écrit par la cascade du compte rendu,
 * `MeetingNotesService.createAccountNeed`, `project_id: null`) n'entre dans
 * AUCUN des buckets de cet onglet : ils ne lisent que `/projects` (table
 * `projects`, stage `confirmed`), jamais `project_needs`. Sans ce lien, ce
 * besoin restait introuvable depuis le dossier compte — pas absent du code,
 * absent de CETTE page, ce qui revient au même pour le commercial qui
 * cherche (même défaut que #2115.23 documenté plus haut dans ce fichier).
 */
describe('TabNeeds — porte vers les besoins ouverts (#2777)', () => {
  it('propose un lien vers les besoins ouverts, filtré sur ce compte', async () => {
    await mount([row()])
    const link = await screen.findByRole('link', { name: 'Voir les besoins ouverts de ce compte' })
    expect(link).toHaveAttribute('href', '/projects/needs?account_id=acc-1')
  })
})

/**
 * #3676 — UNE phrase courte quand il n'y a pas de demande ouverte, pas une
 * grande section « zéro besoin » — et trois états qu'on ne confond pas :
 * « aucune demande connue » · « recherche non faite » · « source indisponible ».
 */
describe('TabNeeds — demandes ouvertes, trois états distincts (#3676)', () => {
  async function mountExpecting(rows: ProjectRow[], text: RegExp, account?: Partial<Account>) {
    mockFetch.mockClear()
    PROJECTS_FAIL = false
    ROWS = rows
    ACCOUNT = { id: 'acc-1', company_name: 'Acme', signals_collected_at: '2026-10-01T00:00:00Z', ...account } as Account
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderWithRouter(
      <QueryClientProvider client={client}>
        <TabNeeds account={ACCOUNT} />
      </QueryClientProvider>,
    )
    return screen.findByText(text)
  }

  it('aucune demande retrouvée dans les sources consultées', async () => {
    expect(await mountExpecting([], /aucune demande ouverte identifiée dans les sources consultées/i)).toBeVisible()
    expect(screen.queryByTestId('linked-objects-summary-confirmed')).toBeNull()
  })

  it('#4022 — hideWhenEmpty : sans demande, rien du tout (ni phrase d’absence, ni titre)', async () => {
    mockFetch.mockClear()
    PROJECTS_FAIL = false
    ROWS = []
    ACCOUNT = { id: 'acc-1', company_name: 'Acme', signals_collected_at: '2026-10-01T00:00:00Z' } as Account
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderWithRouter(
      <QueryClientProvider client={client}>
        <p>rendu</p>
        <TabNeeds account={ACCOUNT} hideWhenEmpty />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(await screen.findByText('rendu')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(/chargement|loading/i)).toBeNull())
    expect(screen.queryByText(/aucune demande ouverte/i)).toBeNull()
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('recherche non faite : le dossier n’a jamais été collecté', async () => {
    expect(
      await mountExpecting([], /la recherche de demandes n’a pas encore été faite/i, { signals_collected_at: null }),
    ).toBeVisible()
  })

  it('source indisponible : dit que la lecture a échoué, ne dit pas « aucune demande »', async () => {
    mockFetch.mockClear()
    PROJECTS_FAIL = true
    ROWS = []
    ACCOUNT = { id: 'acc-1', company_name: 'Acme', signals_collected_at: '2026-10-01T00:00:00Z' } as Account
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderWithRouter(
      <QueryClientProvider client={client}>
        <TabNeeds account={ACCOUNT} />
      </QueryClientProvider>,
    )
    expect(await screen.findByText(/source indisponible/i)).toBeVisible()
    expect(screen.queryByText(/aucune demande ouverte/i)).toBeNull()
  })
})

/**
 * #3681 — « Zéro besoin » n'est plus une impasse : sans demande confirmée, UNE
 * phrase honnête + la meilleure suite ; l'historique est une section
 * secondaire datée, jamais une demande ouverte ; une source en panne n'est pas
 * « aucune demande ».
 */
describe('TabNeeds — sans demande ouverte (#3681)', () => {
  beforeEach(() => {
    PROJECTS_FAIL = false
    NEEDS = []
    ACCOUNT = { id: 'acc-1', company_name: 'Acme', signals_collected_at: '2026-10-01T00:00:00Z' } as Account
  })

  it('écrit UNE phrase, jamais « Besoins confirmés (0) », et propose la suite', async () => {
    mockFetch.mockClear()
    ROWS = []
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onOpenTab = vi.fn()
    renderWithRouter(
      <QueryClientProvider client={client}>
        <TabNeeds account={ACCOUNT} onOpenTab={onOpenTab} />
      </QueryClientProvider>,
    )
    // #3681.2 RÉFUTÉ (recette prod 07/10 soir) — l'issue demande littéralement
    // « Aucune demande ouverte identifiée dans les sources consultées. » ; le
    // code disait « n'a été retrouvée », un synonyme qui n'est pas le libellé
    // demandé.
    expect(
      await screen.findByText(/aucune demande ouverte identifiée dans les sources consultées/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/\(0\)/)).toBeNull()
    // #3676 (recette prod 06/10) — même VIDE, le bloc se nomme, mais sous le
    // libellé de L'ISSUE #3681 (« demande ACTUELLE », jamais « confirmée » —
    // ce bloc lit les besoins OUVERTS, pas l'étape `confirmed` du pipe).
    expect(screen.getByRole('heading', { name: 'Demandes actuelles' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Voir les signaux du compte' }))
    expect(onOpenTab).toHaveBeenCalledWith('veille')
  })

  it('une source indisponible ne se lit pas « aucune demande »', async () => {
    mockFetch.mockImplementationOnce(async () => {
      throw new Error('503')
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderWithRouter(
      <QueryClientProvider client={client}>
        <TabNeeds account={ACCOUNT} />
      </QueryClientProvider>,
    )
    expect(await screen.findByText(/source indisponible/i)).toBeInTheDocument()
    expect(screen.queryByText(/aucune demande ouverte/i)).toBeNull()
    // #3676 / #3681.2 — l'état « source indisponible » se range, lui aussi, sous son titre.
    expect(screen.getByRole('heading', { name: 'Demandes actuelles' })).toBeInTheDocument()
  })

  it('#3817.2 — demandes ouvertes présentes, source des demandes confirmées en panne : le dit, ne tait rien', async () => {
    mockFetch.mockClear()
    PROJECTS_FAIL = true
    ROWS = []
    NEEDS = [need()]
    ACCOUNT = { id: 'acc-1', company_name: 'Acme', signals_collected_at: '2026-10-01T00:00:00Z' } as Account
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderWithRouter(
      <QueryClientProvider client={client}>
        <TabNeeds account={ACCOUNT} />
      </QueryClientProvider>,
    )
    // Les demandes ouvertes (source distincte) répondent normalement.
    expect(await screen.findByText('Architecte data senior')).toBeInTheDocument()
    // La section « Demandes actuelles » le dit, au lieu de disparaître en silence.
    expect(await screen.findByText(/source indisponible/i)).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: 'Demandes actuelles' }).length).toBeGreaterThan(0)
  })

  it('l’historique d’un ancien besoin est daté et séparé des demandes ouvertes', async () => {
    mockFetch.mockClear()
    ROWS = [row({ id: 'p-old', stage: 'lost', label: 'Refonte SI ancienne', stage_entered_at: '2025-03-10T00:00:00Z' })]
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderWithRouter(
      <QueryClientProvider client={client}>
        <TabNeeds account={ACCOUNT} />
      </QueryClientProvider>,
    )
    const history = await screen.findByTestId('needs-history')
    expect(history).toHaveTextContent('Refonte SI ancienne')
    expect(history).toHaveTextContent('2025')
    expect(history).toHaveTextContent('vérifie si cette équipe porte encore le sujet')
    expect(history).not.toHaveTextContent('à pourvoir')
  })
})

/**
 * #3624 (finir, F25) — « le contact vers les personnes concernées par les
 * projets » : chaque demande confirmée nomme ses interlocuteurs reliés
 * (`GET /projects/:id/contacts`) avec un geste « Contacter <nom> » ; sans
 * contact relié, AUCUNE ligne (une absence ne fait pas une ligne).
 */
describe('TabNeeds — « Contacter <personne> » par demande (#3624)', () => {
  const contactsFetch = (byProject: Record<string, unknown[]>) =>
    mockFetch.mockImplementation((args: { path: string; method?: string; body?: unknown }): Promise<never> => {
      const reply = (value: unknown) => Promise.resolve(value) as Promise<never>
      if (args.path.startsWith('/projects?')) return reply(ROWS)
      if (args.path.startsWith('/projects/needs?')) return reply({ data: NEEDS, total: NEEDS.length })
      const match = /^\/projects\/([^/]+)\/contacts$/.exec(args.path)
      if (match) return reply({ items: byProject[match[1] ?? ''] ?? [] })
      if (args.path === '/workspaces/members') return reply([])
      return reply(null)
    })

  it('affiche « Contacter Jeanne Martin » vers la fiche du contact, nom en clair', async () => {
    contactsFetch({
      'p-1': [
        {
          contact_id: '11111111-1111-4111-8111-111111111111',
          full_name: 'Jeanne Martin',
          title: 'DSI',
          email: null,
          role: 'sponsor',
          created_at: '2026-10-01T00:00:00Z',
        },
      ],
    })
    await mount([row()])
    const link = await screen.findByRole('link', { name: /Contacter Jeanne Martin/ })
    expect(link).toHaveAttribute('href', '/contacts/11111111-1111-4111-8111-111111111111')
  })

  it('sans contact relié : aucune ligne « Contacter » et aucun « aucun contact »', async () => {
    contactsFetch({})
    await mount([row()])
    await screen.findByRole('link', { name: 'Ouvrir dans le Pipe' })
    expect(screen.queryByText(/Contacter/)).toBeNull()
    expect(screen.queryByText(/aucun contact/i)).toBeNull()
  })
})

/**
 * #3681 — une demande ACTUELLE documentée dit son intitulé, son périmètre, son
 * statut, sa date utile et le geste ; une annonce de recrutement INTERNE n'est
 * pas une mission de prestation accessible à une ESN — elle ne compte pas comme
 * demande ouverte et ne promet aucune mission.
 */
describe('TabNeeds — demandes actuelles (#3681)', () => {
  async function mountWith(rows: ProjectRow[], needs: Array<Record<string, unknown>>) {
    mockFetch.mockClear()
    PROJECTS_FAIL = false
    ROWS = rows
    NEEDS = needs
    ACCOUNT = { id: 'acc-1', company_name: 'Acme', signals_collected_at: '2026-10-01T00:00:00Z' } as Account
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderWithRouter(
      <QueryClientProvider client={client}>
        <TabNeeds account={ACCOUNT} />
      </QueryClientProvider>,
    )
  }

  it('une demande ouverte montre intitulé, périmètre, statut, date utile et le geste « Voir la demande »', async () => {
    await mountWith([], [need()])
    const card = await screen.findByTestId('open-demands')
    expect(card).toHaveTextContent('Architecte data senior')
    expect(card).toHaveTextContent('Lyon')
    expect(card).toHaveTextContent('2 postes')
    expect(card).toHaveTextContent('Ouverte')
    expect(card).toHaveTextContent(/avant le 20\/10\/2026/i)
    expect(screen.getByRole('link', { name: 'Voir la demande' })).toHaveAttribute('href', '/projects/needs/need-1')
    // Une demande ouverte documentée : plus de phrase « aucune demande ».
    expect(screen.queryByText(/aucune demande ouverte/i)).toBeNull()
  })

  it('un périmètre ou une date absents ne font AUCUNE ligne (ni tiret ni zéro)', async () => {
    await mountWith([], [need({ location: null, headcount: 1, deadline_at: null, start_on: null })])
    const card = await screen.findByTestId('open-demands')
    expect(card).toHaveTextContent('Architecte data senior')
    expect(card.textContent).not.toMatch(/avant le|démarrage|0 poste|—/i)
  })

  it('une annonce de recrutement interne n’est PAS une demande ouverte : la phrase d’absence reste, l’annonce est nommée', async () => {
    await mountWith([], [need({ id: 'cdi', title: 'Responsable BI (CDI)', contract_kind: 'recrutement' })])
    expect(await screen.findByText(/aucune demande ouverte identifiée/i)).toBeInTheDocument()
    expect(screen.getByText(/annonce de recrutement interne/i)).toBeInTheDocument()
    expect(screen.getByText(/Responsable BI \(CDI\)/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Voir la demande' })).toBeNull()
  })
})

/**
 * #3295 — recette salle démo 12/10 : « Pertes documentées » (BNP) introuvable depuis le dossier. Les REX de
 * perte vivent sur la fiche de l'affaire PERDUE (`LostDealRexPanel`), mais l'écran Signaux et besoins
 * (`hideWhenEmpty`, #4022) coupait court AVANT l'historique, et l'historique n'était pas cliquable : une
 * affaire perdue n'avait plus aucune porte depuis le compte.
 */
describe('TabNeeds — l’historique des affaires closes mène à leur fiche (#3295)', () => {
  async function mountHidden(rows: ProjectRow[]) {
    mockFetch.mockClear()
    PROJECTS_FAIL = false
    NEEDS = []
    ROWS = rows
    ACCOUNT = { id: 'acc-1', company_name: 'Acme', signals_collected_at: '2026-10-01T00:00:00Z' } as Account
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderWithRouter(
      <QueryClientProvider client={client}>
        <TabNeeds account={ACCOUNT} hideWhenEmpty />
      </QueryClientProvider>,
    )
  }

  it('hideWhenEmpty : sans demande mais avec une affaire perdue, l’historique reste et ouvre la fiche', async () => {
    await mountHidden([
      row({ id: 'p-lost', stage: 'lost', label: 'Renfort conformité', stage_entered_at: '2026-07-09T00:00:00Z' }),
    ])
    const history = await screen.findByTestId('needs-history')
    expect(history).toHaveTextContent('Renfort conformité')
    const link = within(history).getByRole('link', { name: /Renfort conformité/ })
    expect(link).toHaveAttribute('href', expect.stringContaining('/projects/p-lost'))
  })

  it('hideWhenEmpty : sans aucune affaire close, toujours rien du tout', async () => {
    await mountHidden([])
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText(/chargement|loading/i)).toBeNull())
    expect(screen.queryByTestId('needs-history')).toBeNull()
  })

  it('avec une demande confirmée, l’affaire perdue du compte reste atteignable aussi', async () => {
    await mountHidden([
      row({ id: 'p-conf', stage: 'confirmed', label: 'Migration ERP' }),
      row({ id: 'p-lost', stage: 'lost', label: 'Renfort conformité', stage_entered_at: '2026-07-09T00:00:00Z' }),
    ])
    const history = await screen.findByTestId('needs-history')
    expect(within(history).getByRole('link', { name: /Renfort conformité/ })).toBeInTheDocument()
    expect(within(history).queryByText(/Migration ERP/)).toBeNull()
  })
})
