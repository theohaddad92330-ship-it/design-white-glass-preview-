import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Account, AccountSignalLine, AccountSignalLines, Contact } from '@bellum/contracts'
import { AccountOpportunityScreen } from './AccountOpportunityScreen'

/**
 * #4755 / #4756 (lot 761) — l'écran « Signaux et besoins » est UN tableau : bascule Actuel / Historique, puces de
 * filtre par type avec compteurs, recherche, « À contacter » sur chaque ligne (personne ⇒ « Trouver qui
 * contacter », jamais la liste générique), « voir plus » sans coupe, issue en Historique, projet possible en Actuel.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'count' in options ? `${key}:${String(options.count)}` : key,
    i18n: { language: 'fr' },
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: import('react').ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
}))
vi.mock('@/features/watchlist/view/WatchlistSignalDetail', () => ({
  WatchlistSignalDetail: ({ item }: { item: { companyName: string; signalLabel: string } }) => (
    <div data-testid="watchlist-signal-detail">
      {item.companyName} · {item.signalLabel}
    </div>
  ),
}))

const data = vi.hoisted(() => ({
  lines: null as null | AccountSignalLines,
  contacts: [] as Contact[],
  leadCards: [] as Array<Record<string, unknown>>,
}))
vi.mock('@/features/accounts/hooks/useAccountSignalLines', () => ({
  useAccountSignalLines: () => ({ data: data.lines, isLoading: false, isError: false }),
}))
vi.mock('@/features/contacts/hooks/useContactsByAccount', () => ({
  useContactsByAccount: () => ({ data: data.contacts }),
}))
vi.mock('@/features/accounts/hooks/useAccountPerimeter', () => ({ useAccountPerimeter: () => undefined }))
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: null }),
}))
const refresh = vi.hoisted(() => ({ mutate: vi.fn() }))
vi.mock('@/features/accounts/hooks/useRefreshDimension', () => ({
  useRefreshDimension: () => ({ mutate: refresh.mutate, isPending: false }),
}))
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn(async () => []) }))
vi.mock('../veille/SignalPrograms', () => ({ SignalPrograms: () => <div id="dossier-programs" /> }))
vi.mock('./qualificationLeads', () => ({
  accountQualificationLeads: () => ({ active: data.leadCards }),
}))
vi.mock('./QualificationLeadsQueue', () => ({
  useLeadActions: () => ({
    decide: { mutate: vi.fn(), isPending: false },
    convert: { mutate: vi.fn(), isPending: false },
  }),
  ConvertForm: () => <div data-testid="convert-form" />,
  DismissForm: () => <div data-testid="dismiss-form" />,
}))

const ACCOUNT = { id: 'acc-1', company_name: 'Société Générale' } as unknown as Account

function line(over: Partial<AccountSignalLine> & Pick<AccountSignalLine, 'id' | 'title'>): AccountSignalLine {
  return {
    date: '2026-10-10',
    date_precision: 'day',
    period: 'now',
    type: 'projet',
    detail: null,
    url: null,
    people_hints: { names: [], roles: [], location: null },
    ...over,
  }
}

const JAVA_DEV = {
  id: 'c-java',
  full_name: 'Jeanne Martin',
  title: 'Responsable développement Java',
  email: 'j@sg.fr',
  phone: null,
} as Contact

const verifiedAt = { value: '2026-10-24T08:00:00Z' }

function mount(
  lines: AccountSignalLine[],
  onOpenTab = vi.fn(),
  onAddToPlan = vi.fn(),
  initialPeriod?: AccountSignalLine['period'],
) {
  data.lines = { lines, verified_at: verifiedAt.value, open_deals: 0 }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AccountOpportunityScreen
        account={ACCOUNT}
        onOpenTab={onOpenTab}
        onAddToPlan={onAddToPlan}
        initialPeriod={initialPeriod}
      />
    </QueryClientProvider>,
  )
  return { onOpenTab, onAddToPlan }
}

beforeEach(() => {
  verifiedAt.value = '2026-10-24T08:00:00Z'
  refresh.mutate.mockClear()
  data.contacts = [JAVA_DEV]
  data.leadCards = []
})

const rows = () => screen.queryAllByTestId('signal-row')
/** Lot 773 / #5191 — la ligne est compacte : son détail se lit dans la MODALE (le premier bouton d'une ligne l'ouvre). */
const openDialog = () => screen.getByRole('dialog')
const expand = (row: HTMLElement) => userEvent.click(within(row).getAllByRole('button')[0]!)

describe('AccountOpportunityScreen — le tableau unique', () => {
  it('ouvre sur Actuel, la bascule montre l’Historique — même présentation', async () => {
    mount([
      line({ id: 'now-1', title: 'Développeur Java back-end', type: 'recrutement' }),
      line({
        id: 'past-1',
        title: 'Centre de services data',
        period: 'past',
        date: '2025-09-01',
        type: 'besoin_passe',
        outcome: 'won',
      }),
    ])
    expect(rows().map(row => row.dataset.period)).toEqual(['now'])
    expect(screen.queryByText('Centre de services data')).toBeNull()
    await userEvent.click(screen.getByText('signalTable.period.past'))
    expect(rows().map(row => row.dataset.period)).toEqual(['past'])
    expect(screen.getByText('Centre de services data')).toBeTruthy()
    await expand(rows()[0]!)
    expect(screen.getByTestId('signal-outcome').textContent).toBe('signalTable.outcome.won')
    await userEvent.keyboard('{Escape}')
    // Une seule ligne de fraîcheur, avec son Actualiser.
    await userEvent.click(
      within(screen.getByTestId('signal-table-freshness')).getByText('accountOpportunity.refreshSignals'),
    )
    expect(refresh.mutate).toHaveBeenCalledWith('signals')
  })

  it('lot 764 — arrivé de Signaux › Historique (`?sp=past`), le tableau ouvre sur l’Historique', () => {
    mount(
      [
        line({ id: 'now-1', title: 'Développeur Java back-end', type: 'recrutement' }),
        line({
          id: 'past-1',
          title: 'Centre de services data',
          period: 'past',
          date: '2025-09-01',
          type: 'besoin_passe',
        }),
      ],
      vi.fn(),
      vi.fn(),
      'past',
    )
    expect(rows().map(row => row.dataset.period)).toEqual(['past'])
    expect(screen.queryByText('Développeur Java back-end')).toBeNull()
  })

  it('les puces comptent par type, filtrent, et la recherche croise le filtre', async () => {
    mount([
      line({ id: 'r1', title: 'Développeur Java back-end', type: 'recrutement' }),
      line({ id: 'r2', title: 'Data engineer Python', type: 'recrutement', technologies: ['Python'] }),
      line({ id: 'p1', title: 'Programme cloud', type: 'projet' }),
    ])
    expect(screen.getByText('signalTable.filters.all')).toBeTruthy()
    // Un type absent ne fait aucune puce (jamais « Marché public · 0 »).
    expect(screen.queryByText('signalTable.types.marche_public')).toBeNull()
    await userEvent.click(screen.getAllByText('signalTable.types.recrutement')[0]!)
    expect(rows()).toHaveLength(2)
    await userEvent.type(screen.getByTestId('signal-table-search'), 'python')
    expect(rows()).toHaveLength(1)
    expect(screen.getByText('Data engineer Python')).toBeTruthy()
    await userEvent.clear(screen.getByTestId('signal-table-search'))
    await userEvent.type(screen.getByTestId('signal-table-search'), 'cobol')
    expect(rows()).toHaveLength(0)
    expect(screen.getByTestId('signal-table-empty').textContent).toBe('signalTable.empty.filtered')
  })

  it('À contacter : une personne qui recoupe est proposée ; personne ⇒ « Trouver qui contacter », jamais la liste générique', async () => {
    const { onOpenTab, onAddToPlan } = mount([
      line({ id: 'java', title: 'Développeur Java back-end', type: 'recrutement' }),
      line({
        id: 'none',
        title: 'Augmentation de capital',
        type: 'annonce_legale',
        people_hints: { names: [], roles: ['Directeur financier'], location: null },
      }),
    ])
    const [javaRow, noneRow] = rows()
    // Repliée : la personne est une puce du nom, rien de plus.
    expect(within(within(javaRow!).getByTestId('signal-chips')).getByText('Jeanne Martin')).toBeTruthy()
    expect(screen.queryByText('signalTable.toPlan')).toBeNull()
    await expand(javaRow!)
    expect(within(openDialog()).getByText('signalTable.person.email')).toBeTruthy()
    await userEvent.click(within(openDialog()).getByText('signalTable.toPlan'))
    expect(onAddToPlan).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    expect(within(noneRow!).queryByText('Jeanne Martin')).toBeNull()
    expect(within(noneRow!).queryByTestId('signal-chips')).toBeNull()
    // Lot 773 (b) — « Personne ne recoupe » + « Trouver qui contacter » : UNE fois pour le compte, pas par ligne.
    expect(screen.getAllByTestId('signal-table-nobody')).toHaveLength(1)
    expect(screen.queryByTestId('signal-row-nobody')).toBeNull()
    await userEvent.click(within(screen.getByTestId('signal-table-nobody')).getByText('signalTable.findContact'))
    expect(onOpenTab).toHaveBeenCalledWith('contacts')
  })

  it('Historique : l’interlocuteur de l’époque, et s’il a quitté le compte', async () => {
    data.contacts = [{ ...JAVA_DEV, employment_left: { organization: 'Autre', at: '2026-01-01' } } as Contact]
    mount([
      line({
        id: 'old',
        title: 'Besoin passé SAP',
        period: 'past',
        date: '2024-03-01',
        type: 'besoin_passe',
        contact_ids: ['c-java'],
      }),
    ])
    await userEvent.click(screen.getByText('signalTable.period.past'))
    await expand(rows()[0]!)
    expect(screen.getByText('signalTable.person.reason.then')).toBeTruthy()
    expect(screen.getByText('signalTable.person.left')).toBeTruthy()
  })

  it('plus aucun bloc « Projet possible » sous une ligne, même rattachée à une piste (modale = le détail du besoin)', async () => {
    data.leadCards = [{ key: 'lead-1', label: 'TMA paiements' }]
    mount([line({ id: 'p', title: 'Programme paiements', lead_id: 'lead-1' })])
    await expand(rows()[0]!)
    expect(screen.queryByTestId('signal-possible-project')).toBeNull()
    expect(screen.queryByText('signalTable.possibleProject')).toBeNull()
  })

  it('aucune coupe : 20 lignes puis « voir plus » montre la suite', async () => {
    mount(Array.from({ length: 25 }, (_, index) => line({ id: `l${index}`, title: `Fait numéro ${index}` })))
    expect(rows()).toHaveLength(20)
    await userEvent.click(screen.getByTestId('signal-table-more'))
    expect(rows()).toHaveLength(25)
    expect(screen.queryByTestId('signal-table-more')).toBeNull()
  })

  it('#5004.1 — chaque ligne porte sa NATURE en badge lisible (récent · historique · piste · demande)', () => {
    data.leadCards = []
    mount([
      line({ id: 'r', title: 'Programme cloud', type: 'projet' }),
      line({ id: 'a', title: 'Affaire ouverte', type: 'affaire' }),
      line({ id: 'h', title: 'Ancien besoin', type: 'projet', period: 'past', date: '2025-01-10' }),
    ])
    const natures = screen.getAllByTestId('line-nature').map(node => node.getAttribute('data-nature'))
    expect(natures).toEqual(['recentSignal', 'confirmedDemand'])
    expect(rows()).toHaveLength(2)
  })

  it('#5004.1 — en Historique, la nature est « historique »', async () => {
    mount(
      [line({ id: 'h', title: 'Ancien besoin', type: 'projet', period: 'past', date: '2025-01-10' })],
      vi.fn(),
      vi.fn(),
      'past',
    )
    expect(screen.getByTestId('line-nature').getAttribute('data-nature')).toBe('history')
  })

  it('#5010.1 — le site d’emploi d’origine se nomme sur la ligne ; sans origine, rien', () => {
    mount([
      line({ id: 'o', title: 'Data engineer', type: 'recrutement', origin: 'Indeed', url: 'https://fr.indeed.com/x' }),
      line({ id: 'n', title: 'Chef de projet', type: 'recrutement', url: 'https://x.example/y' }),
    ])
    const metas = screen.getAllByTestId('signal-meta').map(node => node.textContent ?? '')
    expect(metas.filter(text => text.includes('Indeed'))).toHaveLength(1)
  })

  it('#5005.1 — la ligne regroupée LISTE les postes avec leur ville', async () => {
    mount([
      line({
        id: 's',
        title: 'Vingt offres récentes couvrent la data',
        type: 'recrutement',
        merged: [
          { title: 'Data engineer', date: '2026-10-03', url: null, location: 'Lille' },
          { title: 'Architecte cloud', date: '2026-10-09', url: null },
        ],
      }),
    ])
    await expand(rows()[0]!)
    expect(screen.getByText(/Data engineer · Lille/)).toBeTruthy()
    expect(screen.getByText(/Architecte cloud ·/)).toBeTruthy()
  })

  it('lot 787 — la modale d’une ligne regroupée montre les MÊMES personnes que la ligne qui l’ouvre', async () => {
    mount([
      line({
        id: 'g',
        title: 'Vingt offres IT récentes',
        type: 'recrutement',
        people_hints: { names: [], roles: ['Responsable développement Java'], location: null },
        merged: [{ title: 'Développeur Java back-end', date: '2026-10-05', url: null }],
      }),
    ])
    const chips = within(rows()[0]!).getAllByText('Jeanne Martin')
    expect(chips.length).toBeGreaterThan(0)
    await expand(rows()[0]!)
    const people = await within(openDialog()).findByTestId('signal-people')
    expect(within(people).getByText('Jeanne Martin')).toBeTruthy()
  })

  it('lignes regroupées : listées d’emblée dans la modale', async () => {
    mount([
      line({
        id: 'm',
        title: 'Ingénieur DevOps',
        type: 'recrutement',
        merged: [{ title: 'Développeur Java back-end', date: '2026-10-05', url: null }],
      }),
    ])
    expect(screen.queryByText(/Développeur Java back-end ·/)).toBeNull()
    await expand(rows()[0]!)
    expect(screen.getByText(/Développeur Java back-end ·/)).toBeTruthy()
  })

  it('#5031.e — la raison du contact est précise : métier en commun, jamais le texte générique', async () => {
    mount([line({ id: 'java', title: 'Développeur Java back-end', type: 'recrutement' })])
    await expand(rows()[0]!)
    const reason = within(openDialog()).getByTestId('signal-person-reason')
    expect(reason.textContent).toBe('signalTable.person.reason.craft')
    expect(screen.queryByText('signalTable.person.reason.related')).toBeNull()
  })

  it('#5031.e — personne nommée dans l’annonce ⇒ « nommé dans l’annonce »', async () => {
    mount([
      line({
        id: 'n',
        title: 'Jeanne Martin pilote la refonte',
        people_hints: { names: ['Jeanne Martin'], roles: [], location: null },
      }),
    ])
    await expand(rows()[0]!)
    expect(within(openDialog()).getByTestId('signal-person-reason').textContent).toBe('signalTable.person.reason.named')
  })

  it('lot 773 — trois formulations du même fait = UNE ligne « ×3 sources », le dépli les liste', async () => {
    mount([
      line({ id: 'a', title: 'TotalEnergies a annoncé un contrat avec Dell Technologies et NVIDIA pour Pangea 5' }),
      line({ id: 'b', title: 'Signature d’un contrat pour le calcul Pangea 5' }),
      line({ id: 'c', title: 'Signature du contrat Pangea 5 avec Dell' }),
      line({ id: 'd', title: 'Refonte du portail Clients Mobilité' }),
    ])
    expect(rows()).toHaveLength(2)
    expect(screen.getByTestId('signal-group-count').textContent).toBe('signalTable.sources:3')
    await expand(rows()[0]!)
    expect(within(screen.getByTestId('signal-formulations')).getAllByRole('listitem')).toHaveLength(3)
  })

  it('#5031.g — l’historique regroupe les établissements fermés en UNE ligne dépliable, rien n’est supprimé', async () => {
    const closed = (id: string, date: string) =>
      line({ id, title: 'Établissement fermé', type: 'annonce_legale', period: 'past', date, date_precision: 'year' })
    mount([closed('c1', '2003-01-01'), closed('c2', '1998-01-01'), closed('c3', '1993-01-01')])
    await userEvent.click(screen.getByText('signalTable.period.past'))
    expect(rows()).toHaveLength(1)
    expect(screen.getByText('signalTable.closedGroup:3')).toBeTruthy()
    expect(screen.queryAllByTestId('signal-closed-member')).toHaveLength(0)
    await userEvent.click(screen.getByText('signalTable.closedGroup:3'))
    expect(screen.getAllByTestId('signal-closed-member')).toHaveLength(3)
  })

  it('#5031.d — « Préparer le message » et « Au plan » ont une cible de 44 px au moins', async () => {
    mount([line({ id: 'java', title: 'Développeur Java back-end', type: 'recrutement' })])
    await expand(rows()[0]!)
    const plan = within(openDialog()).getByText('signalTable.toPlan').closest('button')!
    // Rendu compact (h-8) + zone de clic débordante de 6 px de chaque côté = 44 px.
    expect(plan.className).toMatch(/h-8/)
    expect(plan.className).toMatch(/after:-inset-y-1\.5/)
  })

  it('#5065.a — la bascule Actuel / Historique garde une zone de clic de 44 px, rendu compact', () => {
    mount([line({ id: 'a', title: 'Développeur Java back-end', type: 'recrutement' })])
    const nav = screen.getByTestId('signals-views')
    expect((nav.firstElementChild as HTMLElement).className).toMatch(/\[&_button\]:after:-inset-y-1\.5/)
  })

  it('#5065.c / lot 771 — une méta grise « source · date » sous le titre : la source générique, jamais le type', () => {
    mount([line({ id: 'a', title: 'Développeur Java back-end', type: 'recrutement', origin_kind: 'offre' })])
    const meta = within(rows()[0]!).getByTestId('signal-meta')
    expect(meta.textContent).toMatch(/^signalTable\.origin\.offre · /)
    expect(meta.textContent).not.toMatch(/types\./)
  })

  it('#5065.d — les dépôts de comptes se regroupent en UNE ligne « N dépôts de comptes », rien n’est supprimé', async () => {
    const filing = (id: string, date: string) =>
      line({ id, title: 'Comptes annuels et rapports', type: 'annonce_legale', period: 'past', date })
    mount([filing('a1', '2022-05-01'), filing('a2', '2024-05-01')])
    await userEvent.click(screen.getByText('signalTable.period.past'))
    expect(rows()).toHaveLength(1)
    await userEvent.click(screen.getByText('signalTable.accountsGroup:2'))
    expect(screen.getAllByTestId('signal-closed-member')).toHaveLength(2)
  })

  it('#5065.e — « N signaux … M projets possibles » ne se lit qu’UNE fois : le panneau latéral ne la répète pas', () => {
    data.leadCards = [{ key: 'lead-1', label: 'TMA paiements' }]
    mount([line({ id: 'p', title: 'Programme paiements', lead_id: 'lead-1' })])
    const side = screen.getByTestId('signal-table-side')
    expect(within(side).queryByText(/signalTable\.side\.now\.(signals|leads)/)).toBeNull()
    expect(screen.getByTestId('signal-table-laura').textContent).toContain('signalTable.laura.leads')
  })

  it('#5065.f — « Collecte antérieure… » s’explique au clavier, sans lancer aucun rejeu', async () => {
    verifiedAt.value = '2026-08-01T08:00:00Z'
    mount([line({ id: 'a', title: 'Développeur Java back-end', type: 'recrutement' })])
    const badge = screen.getByRole('button', { name: /signalTable\.stale/ })
    expect(screen.queryByTestId('signal-stale-help')).toBeNull()
    badge.focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByTestId('signal-stale-help').textContent).toBe('signalTable.staleHelp')
    expect(refresh.mutate).not.toHaveBeenCalled()
  })
})
