import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'
import { ContactContent } from './ContactContent'

/**
 * #2988.1 — enrichissement séparé par coordonnée, premier appelant côté écran.
 *
 * Le pipeline serveur (queue, worker, `EnrichmentProviders.enrich`) filtre déjà
 * par `only` depuis le 25/09 (#2988.2-3-4-5) ; rien à l'écran ne l'envoyait
 * (relevé le 26/09 : `git grep -rn '\bonly\b' apps/web/src/features/contacts/`
 * ne trouvait rien). Ce test tient exactement le geste qui manquait : choisir
 * « Email seulement » / « Téléphone seulement » dans le dialogue de
 * confirmation du lot, et voir ce choix atteindre `useEnrichContact`.
 */

const enrichMutateAsync = vi.fn()
const openEngagement = vi.fn()

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
  useContactEngagement: () => ({ openEngagement }),
  useOptionalContactEngagement: () => ({ openEngagement }),
}))

vi.mock('@/features/contacts/hooks/useEnrichContact', () => ({
  useEnrichContact: () => ({ mutateAsync: enrichMutateAsync, mutate: vi.fn(), isPending: false }),
  enrichErrorDescription: () => null,
}))

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
}))

function makeContact(overrides: Partial<GlobalContact> = {}): GlobalContact {
  return {
    id: 'c1',
    account_id: 'a1',
    full_name: 'Alice Martin',
    title: 'DSI',
    entity: null,
    decision_role: null,
    priority: 5,
    email: null,
    phone: null,
    linkedin_url: null,
    why_contact: null,
    user_status: 'new',
    source: 'apollo',
    created_at: '2026-07-01T10:00:00.000Z',
    updated_at: '2026-07-10T10:00:00.000Z',
    company_name: 'Corp',
    ...overrides,
  }
}

const baseProps = {
  totalContacts: 0,
  lifecycleTally: undefined,
  stateFilter: undefined,
  onLifecycleFilterChange: () => {},
  viewFilter: 'all' as const,
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

async function renderAndSelectAll(contacts: GlobalContact[]) {
  renderWithRouter(<ContactContent {...baseProps} contacts={contacts} totalContacts={contacts.length} />)
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Tout sélectionner' }))
  // Théo B c1-repertoire.R13 — la sélection montre la barre ; « Plus » ouvre le panneau.
  await userEvent.click(await screen.findByRole('button', { name: 'Plus' }))
  await screen.findAllByRole('heading', { name: /contacts? sélectionné/i })
}

beforeEach(() => {
  enrichMutateAsync.mockReset()
  enrichMutateAsync.mockResolvedValue({ id: 'c1', email: null, phone: null, linkedin_url: null })
  openEngagement.mockReset()
})

describe('ContactContent — enrichissement de lot, coordonnée choisie (#2988.1)', () => {
  it('par défaut (« Email + téléphone »), aucune restriction : `only` absent', async () => {
    await renderAndSelectAll([makeContact({ id: 'facturable', full_name: 'Alice Martin' })])

    await userEvent.click(await screen.findByRole('button', { name: /Enrichir maintenant/ }))
    await screen.findByText(/via nos sources d'enrichissement/)
    await userEvent.click(screen.getByRole('button', { name: /^Enrichir$/ }))

    await waitFor(() => expect(enrichMutateAsync).toHaveBeenCalledTimes(1))
    expect(enrichMutateAsync.mock.calls[0]?.[0]).not.toHaveProperty('only')
  })

  it("« Email seulement » sélectionné : `only: 'email'` atteint la mutation", async () => {
    await renderAndSelectAll([makeContact({ id: 'facturable', full_name: 'Alice Martin' })])

    await userEvent.click(await screen.findByRole('button', { name: /Enrichir maintenant/ }))
    await screen.findByText(/via nos sources d'enrichissement/)
    await userEvent.click(screen.getByRole('button', { name: 'Email seulement' }))
    await userEvent.click(screen.getByRole('button', { name: /^Enrichir$/ }))

    await waitFor(() => expect(enrichMutateAsync).toHaveBeenCalledTimes(1))
    expect(enrichMutateAsync.mock.calls[0]?.[0]?.only).toBe('email')
  })

  it("« Téléphone seulement » sélectionné : `only: 'phone'` atteint la mutation", async () => {
    await renderAndSelectAll([makeContact({ id: 'facturable', full_name: 'Alice Martin' })])

    await userEvent.click(await screen.findByRole('button', { name: /Enrichir maintenant/ }))
    await screen.findByText(/via nos sources d'enrichissement/)
    await userEvent.click(screen.getByRole('button', { name: 'Téléphone seulement' }))
    await userEvent.click(screen.getByRole('button', { name: /^Enrichir$/ }))

    await waitFor(() => expect(enrichMutateAsync).toHaveBeenCalledTimes(1))
    expect(enrichMutateAsync.mock.calls[0]?.[0]?.only).toBe('phone')
  })

  it('un second lot armé repart de « les deux » — le choix du lot précédent ne fuite pas', async () => {
    await renderAndSelectAll([
      makeContact({ id: 'facturable-1', full_name: 'Alice Martin' }),
      makeContact({ id: 'facturable-2', full_name: 'Bob Durand' }),
    ])

    await userEvent.click(await screen.findByRole('button', { name: /Enrichir maintenant/ }))
    await screen.findByText(/via nos sources d'enrichissement/)
    await userEvent.click(screen.getByRole('button', { name: 'Email seulement' }))
    // Referme sans confirmer.
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    await userEvent.click(await screen.findByRole('button', { name: /Enrichir maintenant/ }))
    await screen.findByText(/via nos sources d'enrichissement/)
    await userEvent.click(screen.getByRole('button', { name: /^Enrichir$/ }))

    await waitFor(() => expect(enrichMutateAsync).toHaveBeenCalledTimes(2))
    for (const call of enrichMutateAsync.mock.calls) {
      expect(call[0]).not.toHaveProperty('only')
    }
  })
})
