import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { isCriticalOperationInFlight } from '@/lib/critical-operation-guard'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'
import { ContactContent } from './ContactContent'

/**
 * #3822.5 — mesuré en recette prod le 07/10 : un enrichissement de lot a été
 * interrompu par le rechargement automatique de build périmé
 * (`stale-build.ts`, `recoverFromStaleBuild`) en plein milieu — sélection et
 * récapitulatif perdus, trois contacts déjà débités côté serveur sans que
 * l'écran ne le sache plus. Ce test tient la moitié CÔTÉ ÉCRAN du correctif :
 * `enrichSelectedContacts` doit déclarer le lot « en vol » (`critical-operation-
 * guard.ts`) dès le départ, et le relâcher une fois le récapitulatif affiché —
 * jamais avant. `stale-build.test.ts` tient l'autre moitié : le rechargement
 * lui-même diffère tant que ce garde est levé.
 */

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

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
}))

const toastMessage = vi.fn()

vi.mock('sonner', () => ({
  toast: {
    message: (...args: unknown[]) => toastMessage(...args),
    loading: vi.fn(),
    dismiss: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}))

/** Une résolution qu'on déclenche à la main, pour observer le garde PENDANT l'appel. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

function makeContact(overrides: Partial<GlobalContact>): GlobalContact {
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

const enrichMutateAsync = vi.fn()

vi.mock('@/features/contacts/hooks/useEnrichContact', () => ({
  useEnrichContact: () => ({ mutateAsync: enrichMutateAsync, mutate: vi.fn(), isPending: false }),
  enrichErrorDescription: () => null,
}))

beforeEach(() => {
  enrichMutateAsync.mockReset()
  openEngagement.mockReset()
  toastMessage.mockReset()
})

describe("ContactContent — le lot d'enrichissement se déclare « en vol »", () => {
  it('reste en vol pendant les appels réseau, et se relâche après le récapitulatif', async () => {
    const first = deferred<{ id: string; email: string | null; phone: string | null; linkedin_url: string | null }>()
    const second = deferred<{ id: string; email: string | null; phone: string | null; linkedin_url: string | null }>()
    enrichMutateAsync.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    renderWithRouter(
      <ContactContent
        {...baseProps}
        contacts={[
          makeContact({ id: 'c1', full_name: 'Alice Martin' }),
          makeContact({ id: 'c2', full_name: 'Bob Durand' }),
        ]}
        totalContacts={2}
      />,
    )

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Tout sélectionner' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Plus' }))
    await userEvent.click(await screen.findByRole('button', { name: /Enrichir maintenant/ }))
    await userEvent.click(await screen.findByRole('button', { name: /^Enrichir$/ }))

    await waitFor(() => expect(enrichMutateAsync).toHaveBeenCalledTimes(2))
    // Les deux appels sont partis, aucun n'a encore répondu : le lot est en vol.
    expect(isCriticalOperationInFlight()).toBe(true)

    first.resolve({ id: 'c1', email: 'alice@corp.co', phone: null, linkedin_url: null })
    second.resolve({ id: 'c2', email: 'bob@corp.co', phone: null, linkedin_url: null })

    await waitFor(() => expect(isCriticalOperationInFlight()).toBe(false))
  })
})

/**
 * #3822.2 (recette prod 08/10, W 5b4b10d2f3) — le récapitulatif disparaissait
 * seul à +17 s (`TOAST_SUCCESS_MS`, 5 s), alors que la spec #3822 dit « il
 * reste jusqu'à fermeture ». Ce récap porte un chiffre à lire (crédits,
 * trouvés, sans résultat) — jamais un simple accusé de réception.
 */
describe("ContactContent — le récapitulatif d'enrichissement reste jusqu'à fermeture (#3822.2)", () => {
  it('ne porte jamais de `duration` finie, même quand tout le lot a réussi', async () => {
    enrichMutateAsync
      .mockResolvedValueOnce({ id: 'c1', email: 'alice@corp.co', phone: null, linkedin_url: null })
      .mockResolvedValueOnce({ id: 'c2', email: 'bob@corp.co', phone: null, linkedin_url: null })

    renderWithRouter(
      <ContactContent
        {...baseProps}
        contacts={[
          makeContact({ id: 'c1', full_name: 'Alice Martin' }),
          makeContact({ id: 'c2', full_name: 'Bob Durand' }),
        ]}
        totalContacts={2}
      />,
    )

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Tout sélectionner' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Plus' }))
    await userEvent.click(await screen.findByRole('button', { name: /Enrichir maintenant/ }))
    await userEvent.click(await screen.findByRole('button', { name: /^Enrichir$/ }))

    await waitFor(() => expect(toastMessage).toHaveBeenCalled())
    const [, options] = toastMessage.mock.calls.at(-1) as [string, { duration?: number }]
    expect(options.duration).toBe(Number.POSITIVE_INFINITY)
  })
})
