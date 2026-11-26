import { fireEvent, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { Search } from './Search'

/**
 * #4512 — la refonte V22 déplace les réglages d'« Affiner » sous « Personnalisation », elle ne change PAS la requête.
 * Le corps attendu ci-dessous a été relevé sur l'écran D'AVANT (panneau « Affiner ») pour le même cadrage, puis figé :
 * si un réglage se perd, se renomme ou change de forme dans le déplacement, ce test le dit.
 */
const h = vi.hoisted(() => ({ startAnalysis: vi.fn() }))

vi.mock('@/features/search/hooks/useLaunchPlan', () => ({ useLaunchPlan: () => ({ plan: null, loading: false }) }))
vi.mock('@/features/credits/hooks/useCreditGate', () => ({ useCreditGate: () => ({ canAnalyze: true }) }))
vi.mock('@/features/billing/hooks/useCredits', () => ({ useCredits: () => ({ credits: null }) }))
vi.mock('../components/RecentDossiers', async importActual => {
  const actual = await importActual<typeof import('../components/RecentDossiers')>()
  return { ...actual, useRecentDossiers: () => [] }
})
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
    startAnalysis: h.startAnalysis,
    reset: vi.fn(),
  }),
}))
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
vi.mock('@tanstack/react-router', async importActual => {
  const actual = await importActual<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => vi.fn(), useSearch: () => ({}) }
})

beforeAll(() => {
  window.scrollTo = vi.fn()
})

/** Ouvre l'endroit où vivent les réglages fins : « Affiner » avant la refonte, « Personnalisation » après. */
function openRefine(): HTMLElement {
  const step3 = screen.getByRole('region', { name: 'Ton cadrage' })
  const affiner = within(step3).queryByText('Affiner')
  if (affiner) {
    fireEvent.click(affiner)
  } else {
    fireEvent.click(within(step3).getByRole('button', { name: /^Personnalisation/ }))
  }
  return step3
}

describe('#4512 — même cadrage, même requête', () => {
  it('le corps de lancement est celui relevé avant la refonte', async () => {
    renderWithRouter(<Search />)
    const input = await screen.findByPlaceholderText(/Recherche une entreprise/)
    fireEvent.change(input, { target: { value: 'Siemens' } })
    const step3 = openRefine()
    fireEvent.click(within(step3).getByRole('button', { name: 'Manager' }))
    fireEvent.click(within(step3).getByRole('button', { name: 'Direction locale' }))
    fireEvent.click(within(step3).getByRole('button', { name: 'Data / IA' }))
    const priorities = within(step3).getByRole('textbox', { name: /priorit/i })
    fireEvent.change(priorities, { target: { value: 'Régie Data' } })
    fireEvent.keyDown(priorities, { key: 'Enter' })
    const themes = within(step3).getByRole('textbox', { name: /exclure|écarte/i })
    fireEvent.change(themes, { target: { value: 'ERP' } })
    fireEvent.keyDown(themes, { key: 'Enter' })
    fireEvent.click(within(step3).getByRole('button', { name: 'Secteur public' }))
    fireEvent.click(screen.getByRole('button', { name: /Préparer l'analyse/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Lancer l'analyse/ }))
    expect(h.startAnalysis).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(h.startAnalysis.mock.calls[0])).toBe(EXPECTED)
  })
})

// Relevé sur l'écran d'avant (`claude/r23-integ-pr12c`, panneau « Affiner »), le 24/10/2026.
const EXPECTED =
  '["Siemens",{"preset":"strategic"},null,"france",null,"FR",false,' +
  '{"geo_perimeter":"france","depth":"deep","hierarchy_levels":["n2","n1"],"business_families":["Data / IA"],' +
  '"selected_angles":["Régie Data"],"excluded_angles":["ERP"],"exclude_public_sector":true},null,[]]'
