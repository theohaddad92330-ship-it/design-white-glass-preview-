import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as PreferencesProvider from '@/features/preferences/preferences-provider'

/**
 * #1786 — le rebond OAuth (Google) lit la MÊME règle que la connexion par mot
 * de passe (`useRedirectAfterAuth.test.tsx`) : avant ce lot, `useOauthCallback`
 * ne lisait ni `isMobile` ni `defaultView` du tout — `resolveLandingFrom`
 * n'acceptait même pas ces paramètres. Corriger seulement `HomePage` n'aurait
 * jamais couvert ce chemin : un utilisateur qui se connecte avec Google ne
 * passe jamais par l'écran `/`.
 *
 * `cachedTokens` dans `useOauthCallback.ts` est mis en cache au niveau du
 * MODULE (protection StrictMode) : `vi.resetModules()` + un import DYNAMIQUE
 * par test rechargent le module à chaque fois, sinon un seul test sur deux
 * verrait « Tokens OAuth manquants » (le hash déjà consommé par le
 * précédent).
 */

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  getState: vi.fn(),
  getCredits: vi.fn(),
  getMe: vi.fn(),
  handleOauthCallback: vi.fn(),
}))

vi.mock('@/router', () => ({ router: { navigate: h.navigate } }))
vi.mock('@/features/auth/session-manager', () => ({
  sessionManager: { handleOauthCallback: h.handleOauthCallback },
}))
vi.mock('@/features/profiles/api', () => ({ profileApi: { getMe: h.getMe } }))
vi.mock('@/features/onboarding/api', () => ({ onboardingApi: { getState: h.getState } }))
vi.mock('@/features/credits/api', () => ({ creditsApi: { getMine: h.getCredits } }))

// `importOriginal` garde le VRAI `resolveDefaultLandingRoute` : seule la
// LECTURE de la préférence est simulée.
let preferencesDefaultView: 'chat' | 'accounts' = 'chat'
vi.mock('@/features/preferences/preferences-provider', async importOriginal => {
  const actual = await importOriginal<typeof PreferencesProvider>()
  return { ...actual, useReadPreferences: () => ({ defaultView: preferencesDefaultView }) }
})

let queryClient: QueryClient
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.resetModules()
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  h.navigate.mockClear()
  h.handleOauthCallback.mockClear().mockResolvedValue(undefined)
  h.getMe.mockClear().mockResolvedValue({})
  h.getState.mockClear().mockResolvedValue({ status: 'in_progress' })
  h.getCredits.mockClear().mockResolvedValue({ plan: 'decouverte', accounts_used: 0 })
  preferencesDefaultView = 'chat'
  window.location.hash = '#access_token=tok-1&refresh_token=ref-1'
})

describe('useOauthCallback', () => {
  // #1786 — même retour que la connexion par mot de passe, côté rebond OAuth.
  it('après un rebond OAuth, un compte déjà onboardé atterrit chez Laura, plus au tableau de bord (#1786)', async () => {
    h.getState.mockResolvedValue({ status: 'completed' })
    const { useOauthCallback } = await import('./useOauthCallback')
    renderHook(() => useOauthCallback(), { wrapper })
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: '/chat', replace: true }))
  })

  it('garde le choix DÉJÀ fait dans Réglages (Comptes) — une correction humaine gagne toujours (#1786)', async () => {
    preferencesDefaultView = 'accounts'
    h.getState.mockResolvedValue({ status: 'completed' })
    const { useOauthCallback } = await import('./useOauthCallback')
    renderHook(() => useOauthCallback(), { wrapper })
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: '/accounts', replace: true }))
  })

  it("l'onboarding inachevé garde la priorité sur la destination normale, même Laura (#1786)", async () => {
    h.getState.mockResolvedValue({ status: 'not_started' })
    const { useOauthCallback } = await import('./useOauthCallback')
    renderHook(() => useOauthCallback(), { wrapper })
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: '/onboarding', replace: true }))
  })

  it('sans tokens dans le hash, ne navigue jamais', async () => {
    window.location.hash = ''
    const { useOauthCallback } = await import('./useOauthCallback')
    const { result } = renderHook(() => useOauthCallback(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(h.navigate).not.toHaveBeenCalled()
  })
})
