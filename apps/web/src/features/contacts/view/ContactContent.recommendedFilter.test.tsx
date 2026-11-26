import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ContactContent } from './ContactContent'

const motionComponents = new Map<string, unknown>()
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          const Rendered = ({ children, ...props }: any) => {
            const Component = prop
            return <Component {...props}>{children}</Component>
          }
          motionComponents.set(prop, Rendered)
          return Rendered
        }
      },
    },
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useInView: () => true,
  useReducedMotion: () => false,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext', () => ({
  useContactEngagement: () => ({ openEngagement: vi.fn() }),
  useOptionalContactEngagement: () => ({ openEngagement: vi.fn() }),
}))

const baseProps = {
  contacts: [],
  totalContacts: 0,
  lifecycleTally: undefined,
  stateFilter: undefined,
  onLifecycleFilterChange: () => {},
  loading: false,
  query: '',
  onQueryChange: () => {},
  activeFilters: [],
  onFiltersChange: () => {},
  onAddFilter: () => {},
  unassignedFilter: undefined,
  onScopeChange: () => {},
  onClearFilters: () => {},
  isFilterActive: false,
}

function contact(id: string, accountId: string | null) {
  return {
    id,
    account_id: accountId,
    full_name: `Contact ${id}`,
    title: 'DSI',
    entity: null,
    decision_role: null,
    priority: 3,
    email: `${id}@corp.fr`,
    phone: null,
    linkedin_url: null,
    why_contact: null,
    user_status: 'new' as const,
    source: 'apollo',
    created_at: '2026-07-01T10:00:00.000Z',
    updated_at: '2026-07-10T10:00:00.000Z',
    company_name: 'Corp',
  }
}

function renderContacts(over: Partial<Parameters<typeof ContactContent>[0]> = {}) {
  const props = { ...baseProps, onQueryChange: vi.fn(), onClearFilters: vi.fn(), ...over }
  renderWithRouter(<ContactContent {...props} />)
  return props
}

/**
 * #3942.2 — recette prod 09/10 (#3942, PARTIEL) : la portée « Recommandés »
 * filtre désormais CÔTÉ SERVEUR (`recommendedScope`, paginé) — le parent
 * (`ContactsPageContent`) envoie déjà la liste SCOPÉE, et ce composant reste
 * le présenteur stateless qu'il prétend être (aucun classement, aucun
 * filtre recalculé ici). Ce fichier teste le CÂBLAGE du présenteur (comptage,
 * bascule, état vide) ; le classement lui-même est couvert côté API
 * (`contacts.service.spec.ts`, describe `#3942.2`).
 */
describe('ContactContent — #3942.2, la portée « Recommandés » vient du serveur', () => {
  it("affiche `contacts` TEL QUEL (déjà scopé par le serveur) — y compris un contact sans compte, puisque le tri n'est plus fait ici", async () => {
    renderContacts({
      contacts: [contact('c-1', 'a1'), contact('c-2', null)],
      totalContacts: 2,
      recommendedFilter: 'recommended',
    })

    expect(await screen.findByText('Contact c-1')).toBeInTheDocument()
    expect(screen.getByText('Contact c-2')).toBeInTheDocument()
  })

  it('le compteur « Recommandés X / Tous Y » lit `totalContacts` ET `recommendedTally` — jamais un sous-ensemble recalculé', async () => {
    renderContacts({
      contacts: [contact('c-1', 'a1'), contact('c-2', 'a1'), contact('c-3', 'a1')],
      totalContacts: 3,
      recommendedFilter: 'recommended',
      recommendedTally: { recommended: 3, all: 200 },
    })

    // #4661 — le total de la portée active vit dans l'en-tête du répertoire, pas une seconde fois dans la bascule.
    expect(await screen.findByRole('button', { name: /^Recommandés$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tous.*200/ })).toBeInTheDocument()
  })

  it('sur la portée « Tous », le chiffre « Recommandés » reste absent plutôt que faux (aucun second classement payé pour l’afficher)', async () => {
    renderContacts({
      contacts: [contact('c-1', 'a1')],
      totalContacts: 200,
      recommendedFilter: 'all',
      recommendedTally: undefined,
    })

    // « Tous » existe aussi dans les puces de vue : on lit la bascule elle-même, dont le segment actif est nu (#4661).
    const toggle = await screen.findByTestId('contacts-recommended-toggle')
    expect(within(toggle).getByRole('button', { name: /^Tous collectés$/ })).toBeInTheDocument()
    // Le bouton « Recommandés » existe (bascule toujours offerte) mais sans chiffre.
    const recommendedButton = screen.getByRole('button', { name: /^Recommandés$/ })
    expect(recommendedButton).toBeInTheDocument()
  })

  it('« Tous » appelle `onRecommendedFilterChange` — la bascule elle-même vit chez le parent', async () => {
    const onRecommendedFilterChange = vi.fn()
    renderContacts({
      contacts: [contact('c-1', 'a1')],
      totalContacts: 1,
      recommendedFilter: 'recommended',
      onRecommendedFilterChange,
    })

    // Théo c1 — « Tous » existe aussi dans les puces de vue : on vise la bascule Recommandés / Tous.
    const toggle = await screen.findByRole('group', { name: 'Filtrer les contacts recommandés' })
    await userEvent.click(within(toggle).getByRole('button', { name: /^Tous collectés/ }))

    expect(onRecommendedFilterChange).toHaveBeenCalledWith('all')
  })

  it('liste vide sous la portée « recommended » : « aucun recommandé », jamais « aucun recommandé parmi ceux chargés » (le bug #3942 corrigé)', async () => {
    const onRecommendedFilterChange = vi.fn()
    renderContacts({
      contacts: [],
      totalContacts: 0,
      recommendedFilter: 'recommended',
      recommendedTally: { recommended: 0, all: 0 },
      onRecommendedFilterChange,
    })

    await screen.findByText('Aucun contact recommandé')
    await userEvent.click(screen.getByRole('button', { name: 'Tous collectés' }))

    expect(onRecommendedFilterChange).toHaveBeenCalledWith('all')
  })

  it('liste vide sous la portée « all » : l’état vide générique, pas le message « Recommandés »', async () => {
    renderContacts({ contacts: [], totalContacts: 0, recommendedFilter: 'all' })

    expect(screen.queryByText('Aucun contact recommandé')).not.toBeInTheDocument()
  })

  // #4770.3 — le compteur de l'en-tête est comparé au nombre de LIGNES RENDUES (pas seulement son libellé) :
  // une liste entièrement chargée annonce exactement ce qu'elle montre.
  it('#4770.3 — le total annoncé égale les lignes rendues quand tout est chargé', async () => {
    const rows = [contact('c-1', 'a1'), contact('c-2', 'a1'), contact('c-3', 'a2')]
    renderContacts({ contacts: rows, totalContacts: rows.length, recommendedFilter: 'all' })
    await screen.findByText('Contact c-1')
    const rendered = screen.getAllByText(/^Contact c-\d$/)
    expect(rendered).toHaveLength(rows.length)
    // La ligne de pagination annonce « 1–N sur N contacts » : N = les lignes rendues, jamais un autre périmètre.
    expect(screen.getByText(new RegExp(`1–${rendered.length} sur ${rendered.length} contacts`))).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('69773')
  })
})
