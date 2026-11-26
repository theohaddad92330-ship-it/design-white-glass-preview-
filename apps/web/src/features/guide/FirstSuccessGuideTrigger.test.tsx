import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { FirstSuccessGuideTrigger } from './FirstSuccessGuideTrigger'
import { useGuideStore } from './guide-store'
import { wasFirstSuccessGuideShown } from './first-success-guide-seen'

/**
 * #2214.23 — L'APPELANT RÉEL, monté au root (`routes/__root.tsx`). Ce test ne
 * revérifie pas `shouldStartFirstSuccessGuide` (pur, déjà couvert dans
 * `first-success-guide-trigger.test.ts`) : il prouve que ce composant LIT les
 * bonnes sources (route, session, état d'onboarding, fil en cours) et ÉCRIT
 * au bon endroit (le store, `localStorage`) — la chaîne de bout en bout que
 * les lots précédents ont laissée non câblée.
 */
let mockPathname = '/chat'
let mockNeedsOnboarding: boolean | undefined = false
let mockUser: { id: string } | null = { id: 'user-1' }

vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: mockPathname } }),
}))

vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: mockUser, loading: false }),
}))

vi.mock('@/features/profiles/hooks/useOnboardingStatus', () => ({
  useOnboardingStatus: () => ({ needsOnboarding: mockNeedsOnboarding, isLoading: false }),
}))

beforeEach(() => {
  mockPathname = '/chat'
  mockNeedsOnboarding = false
  mockUser = { id: 'user-1' }
  useGuideStore.setState({ session: null })
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('FirstSuccessGuideTrigger — #2214.23', () => {
  it('démarre le guide 1 sur /chat une fois l’onboarding terminé', () => {
    render(<FirstSuccessGuideTrigger />)
    expect(useGuideStore.getState().session?.steps[0]?.anchor).toBe('laura.saisie')
  })

  it('enregistre l’affichage — ne redémarre pas au second montage', () => {
    render(<FirstSuccessGuideTrigger />)
    expect(wasFirstSuccessGuideShown('user-1')).toBe(true)
    useGuideStore.getState().stop()
    render(<FirstSuccessGuideTrigger />)
    expect(useGuideStore.getState().session).toBeNull()
  })

  it('ne démarre rien hors de /chat', () => {
    mockPathname = '/search'
    render(<FirstSuccessGuideTrigger />)
    expect(useGuideStore.getState().session).toBeNull()
  })

  it('ne démarre rien tant que l’onboarding n’est pas terminé', () => {
    mockNeedsOnboarding = true
    render(<FirstSuccessGuideTrigger />)
    expect(useGuideStore.getState().session).toBeNull()
  })

  it('ne remplace jamais un fil déjà en cours', () => {
    useGuideStore.getState().start({
      mode: 'tutoriel',
      level: 'coachmark',
      steps: [{ anchor: 'retour.panneau', titleKey: 't', bodyKey: 'b' }],
    })
    render(<FirstSuccessGuideTrigger />)
    expect(useGuideStore.getState().session?.steps[0]?.anchor).toBe('retour.panneau')
  })

  it('sans session (déconnecté), ne fait rien', () => {
    mockUser = null
    render(<FirstSuccessGuideTrigger />)
    expect(useGuideStore.getState().session).toBeNull()
  })
})
