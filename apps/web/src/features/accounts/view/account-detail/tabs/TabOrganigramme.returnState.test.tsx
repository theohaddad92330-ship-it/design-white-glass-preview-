import type { Contact } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useNavigate,
  useParams,
  useSearch,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { accountCrumbTarget, readContactOrigin } from '@/features/contacts/lib/contactOrigin'
import { accountDetailSearchSchema } from '../accountDetailSearch'
import { TabOrganigramme } from './TabOrganigramme'
import { useOrgUrlState } from './organigramme/useOrgUrlState'

/**
 * #4061.b — aller-retour fiche → retour : la vue, le filtre et la sélection de l'organigramme sont retrouvés,
 * par le bouton « retour » du navigateur ET par le fil d'Ariane de la fiche. Vrai routeur, vraie validation
 * d'URL, vrai câblage (`useOrgUrlState`) — pas un état simulé.
 */
// #4116 (recette 13/10) — le bandeau de fraîcheur lit `useIsDemo` (hors démo seulement).
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/features/credits/hooks/useCreditGate', () => ({
  useCreditGate: () => ({
    known: true,
    analysesLeft: 10,
    enrichmentsLeft: 10,
    canAnalyze: true,
    canEnrich: true,
    locked: false,
  }),
}))
// Intégration 13/10 : #4072.1 (main) a ajouté `useKnownPeople` à FocalOrgView, qui lit la session — hors sujet ici.
vi.mock('@/features/account-facts/useKnownPeople', () => ({ useKnownPeople: () => null }))
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: undefined, isPending: false, isError: false }),
}))

const person = (full_name: string): Contact =>
  ({
    id: full_name,
    account_id: 'a1',
    full_name,
    decision_role: 'economic',
    priority: 3,
    title: '',
    entity: 'EDF',
  }) as unknown as Contact
// #4061 (R31) — l'un porte un profil LinkedIn, l'autre non : la fiche s'ouvre pareil.
const CONTACTS = [
  { ...person('Patrick Charignon'), linkedin_url: 'https://www.linkedin.com/in/patrick-charignon' } as Contact,
  { ...person('Vincent Niebel'), linkedin_url: null } as Contact,
]

const RAW = {
  org: {
    orgGraph: {
      graphVersion: 1,
      entities: [{ id: 'e1', name: 'EDF SA', type: 'groupe', confidence: 85 }],
      people: [
        {
          id: 'p-patrick-charignon',
          fullName: 'Patrick Charignon',
          entityId: 'e1',
          identityStatus: 'classified',
          confidence: 90,
        },
        {
          id: 'p-vincent-niebel',
          fullName: 'Vincent Niebel',
          entityId: 'e1',
          identityStatus: 'classified',
          confidence: 80,
        },
      ],
      hierarchyEdges: [
        {
          fromId: 'p-vincent-niebel',
          toId: 'p-patrick-charignon',
          type: 'reports_to',
          sourceIds: ['s1'],
          confidence: 95,
          verified: true,
        },
        {
          fromId: 'p-patrick-charignon',
          toId: 'e1',
          type: 'member_of',
          sourceIds: [],
          confidence: 60,
          verified: false,
        },
      ],
      influenceEdges: [],
      buyingCommittee: [],
      recommendedPath: [],
      rejectedItems: [],
    },
  },
}

function AccountPage() {
  const org = useOrgUrlState('a1')
  return (
    <TabOrganigramme
      accountId="a1"
      contacts={CONTACTS}
      rawAnalysis={RAW}
      viewState={org.viewState}
      onViewStateChange={org.onViewStateChange}
      onContactClick={org.openContact}
    />
  )
}

function ContactPage() {
  const navigate = useNavigate()
  const { id } = useParams({ strict: false }) as { id?: string }
  const search = useSearch({ strict: false }) as Record<string, unknown>
  const crumb = accountCrumbTarget(readContactOrigin(search), 'a1')
  return (
    <>
      <p data-testid="contact-page">{id}</p>
      <button
        type="button"
        onClick={() =>
          crumb &&
          void navigate({
            to: '/accounts/$id',
            params: { id: crumb.accountId },
            search: { tab: crumb.tab, ...crumb.filters, ...crumb.org },
          })
        }
      >
        Fil d’Ariane
      </button>
    </>
  )
}

function mount(initial = '/accounts/a1?tab=organigramme') {
  const root = createRootRoute()
  const account = createRoute({
    getParentRoute: () => root,
    path: '/accounts/$id',
    validateSearch: accountDetailSearchSchema,
    component: AccountPage,
  })
  const contact = createRoute({
    getParentRoute: () => root,
    path: '/contacts/$id',
    validateSearch: (search: Record<string, unknown>) => search,
    component: ContactPage,
  })
  const router = createRouter({
    routeTree: root.addChildren([account, contact]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const tab = (key: string) => screen.findByRole('tab', { name: i18n.t(`accountOrg:orgViews.${key}`) })

describe('#4061.b — le retour d’une fiche retrouve vue, filtre et sélection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('Hiérarchie : la vue et le nœud choisi reviennent — bouton navigateur ET fil d’Ariane', async () => {
    const user = userEvent.setup()
    const router = mount()
    await user.click(await tab('hierarchy'))
    await user.click(
      await screen.findByRole('button', {
        name: i18n.t('accountOrg:focal.openContactAria', { name: 'Patrick Charignon' }),
      }),
    )
    await screen.findByRole('button', { name: 'Fil d’Ariane' })
    // Refonte Théo (23/10) — la Hiérarchie (l'arbre) EST la vue par défaut : elle ne s'écrit pas dans l'URL,
    // la sélection, si.
    expect(router.state.location.search).toMatchObject({
      fromOrg: expect.stringContaining('"os":"p-patrick-charignon"'),
    })
    expect(String(router.state.location.search.fromOrg)).not.toContain('"ov":"focal"')

    // 1) bouton « retour » du navigateur
    router.history.back()
    expect(await tab('hierarchy')).toHaveAttribute('aria-selected', 'true')
    const node = document.querySelector('[data-org-person="p-patrick-charignon"]')
    expect(node?.className).toContain('ring-[var(--bellum-text-accent)]')
    expect(document.querySelector('[data-org-person="p-vincent-niebel"]')?.className).not.toContain(
      'ring-[var(--bellum-text-accent)]',
    )

    // 2) fil d’Ariane
    await user.click(
      await screen.findByRole('button', {
        name: i18n.t('accountOrg:focal.openContactAria', { name: 'Patrick Charignon' }),
      }),
    )
    await user.click(await screen.findByRole('button', { name: 'Fil d’Ariane' }))
    expect(await tab('hierarchy')).toHaveAttribute('aria-selected', 'true')
    await waitFor(() =>
      expect(document.querySelector('[data-org-person="p-patrick-charignon"]')?.className).toContain(
        'ring-[var(--bellum-text-accent)]',
      ),
    )
  })

  it('Influence (carte complète) : le filtre tapé et la personne mise en avant reviennent', async () => {
    const user = userEvent.setup()
    const router = mount()
    // Refonte Théo — l'arbre arrive en tête : la carte complète s'ouvre depuis la vue focale, à un clic.
    await user.click(await tab('focal'))
    await user.click(await screen.findByRole('button', { name: i18n.t('accountOrg:focal.systemView') }))
    await user.type(await screen.findByLabelText(i18n.t('accountOrg:orgMap.search.label')), 'Charignon')
    await user.click(await screen.findByRole('button', { name: i18n.t('accountOrg:orgMap.viewProfile') }))
    await screen.findByRole('button', { name: 'Fil d’Ariane' })
    router.history.back()
    const input = await screen.findByLabelText(i18n.t('accountOrg:orgMap.search.label'))
    expect(input).toHaveValue('Charignon')
    // la personne mise en avant revient aussi : « Tout afficher » (effacer la mise en avant) est de retour.
    expect(screen.getAllByRole('button', { name: i18n.t('accountOrg:orgMap.focus.clear') }).length).toBeGreaterThan(1)
    expect(router.state.location.search).toMatchObject({ os: 'p-patrick-charignon' })
  })

  // #4061.c — la vue Focale (par défaut) porte aussi sa sélection dans l'URL.
  it('Focale : cliquer une carte écrit `os` ; recharger le lien rouvre la même carte en évidence', async () => {
    const user = userEvent.setup()
    const router = mount('/accounts/a1?tab=organigramme&ov=focal')
    await user.click(
      await screen.findByRole('button', {
        name: i18n.t('accountOrg:focal.openContactAria', { name: 'Patrick Charignon' }),
      }),
    )
    await screen.findByRole('button', { name: 'Fil d’Ariane' })
    expect(router.state.location.search).toMatchObject({
      fromOrg: expect.stringContaining('"os":"p-patrick-charignon"'),
    })
    cleanup()

    // « recharger » : un montage neuf sur l'URL portant la sélection.
    mount('/accounts/a1?tab=organigramme&ov=focal&os=p-patrick-charignon')
    const cards = await screen.findAllByTestId('focal-person-card')
    const selected = cards.filter(card => card.getAttribute('aria-current') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0]).toHaveTextContent('Patrick Charignon')
  })

  it('Focale — SAIT DIRE NON : sans `os`, aucune carte n’est mise en évidence', async () => {
    mount('/accounts/a1?tab=organigramme&ov=focal')
    const cards = await screen.findAllByTestId('focal-person-card')
    expect(cards.some(card => card.hasAttribute('aria-current'))).toBe(false)
  })

  it('SAIT DIRE NON — sans geste, aucune clé d’organigramme dans l’URL', async () => {
    const router = mount()
    await tab('focal')
    expect(router.state.location.search).toEqual({ tab: 'organigramme' })
  })
})

const openAria = (name: string) => i18n.t('accountOrg:focal.openContactAria', { name })

// #4061 (recette R31) — « une personne ouvre sa fiche depuis Hiérarchie ET Influence, avec et sans LinkedIn ».
describe('#4061.a — la fiche s’ouvre depuis Hiérarchie ET Influence, avec ou sans LinkedIn', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it.each([
    ['Patrick Charignon', 'avec LinkedIn'],
    ['Vincent Niebel', 'sans LinkedIn'],
  ])('Hiérarchie : %s (%s) ouvre SA fiche', async name => {
    const user = userEvent.setup()
    mount()
    await user.click(await tab('hierarchy'))
    await user.click(await screen.findByRole('button', { name: openAria(name) }))
    expect(await screen.findByTestId('contact-page')).toHaveTextContent(name)
  })

  it.each([
    ['Patrick Charignon', 'avec LinkedIn'],
    ['Vincent Niebel', 'sans LinkedIn'],
  ])('Influence : %s (%s) ouvre SA fiche par « Voir la fiche »', async name => {
    const user = userEvent.setup()
    mount()
    await user.click(await tab('focal'))
    await user.click(await screen.findByRole('button', { name: i18n.t('accountOrg:focal.systemView') }))
    await user.type(await screen.findByLabelText(i18n.t('accountOrg:orgMap.search.label')), name)
    await user.click(await screen.findByRole('button', { name: i18n.t('accountOrg:orgMap.viewProfile') }))
    expect(await screen.findByTestId('contact-page')).toHaveTextContent(name)
  })
})

// #4061 (recette R31) — « le retour conserve branche, filtres et sélection ».
describe('#4061.b — le retour conserve branche, filtres et sélection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('Influence : direction (od), filtres (of) et sélection (os) survivent à l’aller-retour', async () => {
    const user = userEvent.setup()
    const url = '/accounts/a1?tab=organigramme&ov=system&od=e1&of=' + encodeURIComponent('name=Charignon')
    const router = mount(url)
    await user.click(await screen.findByRole('button', { name: i18n.t('accountOrg:orgMap.viewProfile') }))
    await screen.findByRole('button', { name: 'Fil d’Ariane' })
    const origin = String(router.state.location.search.fromOrg)
    for (const key of ['"ov":"system"', '"od":"e1"', '"of"', '"os"']) expect(origin).toContain(key)

    await user.click(await screen.findByRole('button', { name: 'Fil d’Ariane' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/accounts/a1'))
    expect(router.state.location.search).toMatchObject({
      ov: 'system',
      od: 'e1',
      os: expect.any(String),
    })
    expect(String(router.state.location.search.of)).toContain('name=Charignon')
  })

  it('SAIT DIRE NON — un autre nom que celui du filtre ne revient pas : pas de clé `of` sans filtre posé', async () => {
    const user = userEvent.setup()
    const router = mount('/accounts/a1?tab=organigramme&ov=hierarchy')
    await user.click(await screen.findByRole('button', { name: openAria('Patrick Charignon') }))
    await screen.findByRole('button', { name: 'Fil d’Ariane' })
    expect(String(router.state.location.search.fromOrg)).not.toContain('"of"')
  })
})
