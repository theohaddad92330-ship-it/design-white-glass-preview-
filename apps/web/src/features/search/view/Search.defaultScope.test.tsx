import { fireEvent, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { Search } from './Search'

/**
 * #4161 — retour bêta 14/10 : « mon périmètre doit être appliqué par défaut
 * sur les analyses ». Avant ce lot, une analyse FRAÎCHE (aucun périmètre dans
 * l'URL) repartait toujours de « France », même pour un utilisateur qui avait
 * déjà choisi « IT & Digital » lors d'une analyse précédente — il devait
 * recliquer à chaque société cherchée.
 *
 * `renderWithRouter` fixe `user: null` dans son `SessionContext` (les autres
 * tests de l'écran n'ont pas besoin d'une session réelle) : ce fichier mocke
 * `useSession` séparément pour un utilisateur IDENTIFIÉ, seule façon
 * d'exercer la mémorisation par utilisateur.
 */

vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1' }, loading: false }),
}))
// Refonte Théo — les analyses récentes (pied de page) n'ont rien à faire ici : jamais le réseau.
vi.mock('@/features/accounts/hooks/useAccounts', () => ({ useAccounts: () => ({ data: undefined }) }))
const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', async importActual => {
  const actual = await importActual<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigateMock, useSearch: () => ({}) }
})
// Pas de compte source, pas de suggestion : une arrivée fraîche sur /search.
vi.mock('@/features/accounts/hooks/useAccount', () => ({
  useAccount: () => ({ account: null, contacts: [], loading: false, error: null }),
}))
vi.mock('@/features/search/hooks/useAnalysis', () => ({
  useAnalysis: () => ({
    status: 'idle',
    phase: null,
    percent: null,
    accountId: null,
    error: null,
    startAnalysis: vi.fn(),
    reset: vi.fn(),
  }),
}))
// Un utilisateur identifié sans solde chargé verrait « 0 crédit » et un lancement bloqué :
// ce fichier teste le cadrage, pas le solde.
vi.mock('@/features/billing/hooks/useCredits', () => ({ useCredits: () => ({ credits: null }) }))
vi.mock('@/features/credits/hooks/useCreditGate', () => ({ useCreditGate: () => ({ canAnalyze: true }) }))
vi.mock('@/features/search/hooks/useCompanySearch', () => ({
  useCompanySearch: () => ({ suggestions: [], loading: false, search: vi.fn(), clearSuggestions: vi.fn() }),
  MIN_QUERY_LENGTH: 2,
}))
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => 'div' }),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useInView: () => true,
  useReducedMotion: () => true,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

beforeAll(() => {
  window.scrollTo = vi.fn()
})

beforeEach(() => {
  window.localStorage.clear()
})

// Théo B r1-recherche.A5 — la zone vit dans la feuille « Quel périmètre travailler ? » de la page de cadrage.
async function openCadrage() {
  renderWithRouter(<Search />)
  const input = await screen.findByPlaceholderText(/Recherche une entreprise/)
  fireEvent.change(input, { target: { value: 'Siemens' } })
  fireEvent.click(screen.getByRole('button', { name: /Préparer l'analyse/ }))
  await screen.findByText(/Le bon périmètre, dès le départ/)
}

/**
 * Cadrage analyse (15/10) — l'écran 1 n'a plus de sélecteur : la mémoire #4161
 * se migre vers la question « Où ? » de l'écran « Cadrer », et c'est le
 * lancement confirmé qui mémorise le périmètre DÉDUIT de « Où ? ».
 */
describe('#4161 — le périmètre mémorisé devient le défaut d’une analyse fraîche', () => {
  it('sans rien mémorisé, le défaut reste « France » (#3743, inchangé)', async () => {
    await openCadrage()
    expect(screen.getByRole('button', { name: 'France' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('un ancien périmètre mémorisé (« IT & Digital ») se migre vers « Monde », sans reclic', async () => {
    window.localStorage.setItem('bellum:search-scope:u-1', 'it_digital')
    await openCadrage()
    expect(screen.getByRole('button', { name: 'Monde' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'France' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('le lancement confirmé mémorise le périmètre déduit de « Où ? » pour la PROCHAINE analyse', async () => {
    await openCadrage()
    fireEvent.click(screen.getByRole('button', { name: 'Monde' }))
    fireEvent.click(screen.getByRole('button', { name: /Lancer l'analyse/ }))
    expect(window.localStorage.getItem('bellum:search-scope:u-1')).toBe('groupe')
  })
})
