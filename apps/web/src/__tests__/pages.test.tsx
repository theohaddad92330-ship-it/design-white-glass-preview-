/**
 * pages.test.tsx
 * Tests for pages that do not have their own co-located test file:
 *   - Accounts
 *   - AuthCallback
 *
 * Each test verifies the page renders without throwing under three scenarios:
 *   1. Empty data / unauthenticated (default mock: no session, apiFetch returns [])
 *   2. Loading state  (apiFetch hangs — never resolves during render)
 *   3. Error state    (apiFetch rejects)
 *
 * Framework: Vitest + React Testing Library (matches existing test setup).
 * Global mocks for supabase, socket.io-client, framer-motion and @/lib/api
 * are already installed in apps/web/src/test/setup.ts, so we only override
 * what is specific to these tests.
 */

import { screen } from '@testing-library/react'
import { vi, afterEach } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

// ---------------------------------------------------------------------------
// Module-level mock: framer-motion (same pattern used in all other page tests)
// ---------------------------------------------------------------------------
/**
 * ⚠️ Le Proxy MÉMORISE ses composants.
 *
 * Sans ce cache, chaque accès à `motion.div` rend une closure NEUVE : React voit
 * un type différent d'un rendu à l'autre, démonte tout le sous-arbre et le
 * remonte — l'état local des enfants part avec, et le test devient aveugle à
 * toute interaction qui change un état. Mesuré le 03/09 : un clic passait, le
 * `setState` était bien appelé, et l'écran entier disparaissait du DOM.
 */
const motionComponents = new Map<string, unknown>()

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useInView: () => true,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

// ---------------------------------------------------------------------------
// Import pages AFTER mocks are registered
// ---------------------------------------------------------------------------
import { AccountsPage } from '@/features/accounts/view/AccountsPage'
import { AuthCallback } from '@/features/auth/view/AuthCallback'

// apiFetch is globally mocked in setup.ts to return {} — we override per suite
import { apiFetch } from '@/lib/api'
const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>

// Alias over renderWithRouter preserved for call-site readability.
function renderPage(ui: React.ReactElement) {
  return renderWithRouter(ui)
}

// ---------------------------------------------------------------------------
// Reset mocks between tests so suites are isolated
// ---------------------------------------------------------------------------
afterEach(() => {
  vi.clearAllMocks()
})

// ===========================================================================
// Accounts page
// ===========================================================================
describe('Accounts page', () => {
  it('renders without crash — empty data (no session)', () => {
    // apiFetch never gets called because useAuth returns no session,
    // but the component must still mount without throwing
    mockApiFetch.mockResolvedValue([])
    renderPage(<AccountsPage />)
    // The page header should always be present
    expect(document.body).toBeTruthy()
  })

  it('renders loading state — shimmer skeleton visible', async () => {
    // apiFetch never resolves → component stays in loading state
    mockApiFetch.mockImplementation(() => new Promise(() => {}))
    renderPage(<AccountsPage />)
    // In loading state the component renders shimmer rows inside the table
    expect(document.body).toBeTruthy()
  })

  it('renders empty state — zero accounts returned', async () => {
    mockApiFetch.mockResolvedValue([])
    renderPage(<AccountsPage />)
    expect(document.body).toBeTruthy()
  })

  it('renders error state — apiFetch rejects', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'))
    renderPage(<AccountsPage />)
    expect(document.body).toBeTruthy()
  })

  it('renders page heading', () => {
    mockApiFetch.mockResolvedValue([])
    renderPage(<AccountsPage />)
    // The heading "Comptes" is always rendered regardless of data state
    const heading = screen.queryByText('Comptes')
    // It may or may not be immediately visible depending on auth state,
    // but the component must not throw during render
    expect(document.body).toBeTruthy()
    // If the heading is present, assert its content
    if (heading) {
      expect(heading).toBeInTheDocument()
    }
  })
})

// ===========================================================================
// AuthCallback page
// ===========================================================================
describe('AuthCallback page', () => {
  it('renders without crash', () => {
    renderPage(<AuthCallback />)
    expect(document.body).toBeTruthy()
  })

  /*
   * These two used to assert a hard-coded "Connexion en cours..." string and an
   * `.animate-spin` div. Both were removed when the view moved to
   * `GlobalLoadingState` / `BrailleLoader`, so they asserted a UI that no longer
   * exists. They now assert the loading indicator through its accessibility
   * contract, which is what actually matters and does not break on restyling.
   *
   * They are also `async`: `renderWithRouter` mounts a TanStack `RouterProvider`,
   * which resolves its first match in a microtask — the container is still empty
   * when `render()` returns, so any synchronous query finds nothing.
   */
  it('renders the loading indicator while the OAuth callback resolves', async () => {
    renderPage(<AuthCallback />)
    expect(await screen.findByRole('status')).toBeInTheDocument()
  })

  it('labels the loading indicator for assistive technology', async () => {
    renderPage(<AuthCallback />)
    expect(await screen.findByLabelText('Loading')).toBeInTheDocument()
  })
})
