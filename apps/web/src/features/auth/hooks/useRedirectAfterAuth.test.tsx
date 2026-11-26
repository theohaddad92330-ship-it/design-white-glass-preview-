import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@bellum/contracts'
import type * as PreferencesProvider from '@/features/preferences/preferences-provider'
import { useRedirectAfterAuth } from './useRedirectAfterAuth'

/**
 * Régression prod du 23/07 : l'application tournait en boucle et finissait sur
 * « Oups ». Cause : ce hook re-navigue à CHAQUE changement d'identité de `user`.
 * Le `SessionManager` diffuse `session-applied` sur un `BroadcastChannel` — un
 * second onglet qui rafraîchit sa session repose donc un nouvel objet `user`
 * dans celui-ci, l'effet refire, et chaque `navigate` annule le `beforeLoad`
 * en vol de la route cible : ~160 `GET /onboarding/state` en 3 s, l'API
 * rate-limite (429), et le 429 levé dans un `beforeLoad` casse l'écran.
 *
 * Deux verrous, testés ici :
 *  1. un seul rebond par identité, quelle que soit la fréquence des mises à jour ;
 *  2. la destination dépend de l'état réel du compte — un compte établi ne
 *     retourne pas dans le questionnaire.
 *
 * #1786 — un troisième verrou depuis le retour de Louis : la destination
 * « normale » (hors onboarding) n'est plus `/dashboard` en dur, elle vient de
 * LA MÊME dérivation que `HomePage` (`resolveDefaultLandingRoute`), dont le
 * défaut est désormais Laura (`/chat`). `preferencesDefaultView` fixe le
 * scénario « rien n'a jamais été choisi dans Réglages » (`chat`, par défaut
 * dans ce fichier) contre « un choix déjà fait » (`accounts`, posé test par
 * test).
 */

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  getState: vi.fn(),
  getCredits: vi.fn(),
  fetchQuery: vi.fn(),
  consumePreLoginTarget: vi.fn(),
}))

vi.mock('@/router', () => ({ router: { navigate: h.navigate } }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ fetchQuery: h.fetchQuery }) }))
vi.mock('@/features/profiles/api', () => ({ profileApi: { getMe: vi.fn() } }))
vi.mock('@/features/onboarding/api', () => ({ onboardingApi: { getState: h.getState } }))
vi.mock('@/features/credits/api', () => ({ creditsApi: { getMine: h.getCredits } }))
vi.mock('@/features/auth/lib/pre-login-target', () => ({ consumePreLoginTarget: h.consumePreLoginTarget }))

let sessionUser: SessionUser | null = null
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: sessionUser, loading: false }) }))

// `importOriginal` garde le VRAI `resolveDefaultLandingRoute` (et
// `DEFAULT_VIEW_ROUTE`, `MOBILE_HOME`…) : seule la LECTURE de la préférence
// est simulée, jamais le calcul qui en découle.
let preferencesDefaultView: 'chat' | 'accounts' = 'chat'
vi.mock('@/features/preferences/preferences-provider', async importOriginal => {
  const actual = await importOriginal<typeof PreferencesProvider>()
  return { ...actual, useReadPreferences: () => ({ defaultView: preferencesDefaultView }) }
})

/** Un nouvel objet à chaque appel — exactement ce que produit un `setState`
 *  du SessionManager déclenché par le BroadcastChannel d'un autre onglet. */
const freshUser = (id = 'u-1'): SessionUser => ({ id, email: 'theo@esn.fr' }) as unknown as SessionUser

describe('useRedirectAfterAuth', () => {
  beforeEach(() => {
    h.navigate.mockClear()
    h.fetchQuery.mockResolvedValue({})
    h.getState.mockResolvedValue({ status: 'in_progress' })
    h.getCredits.mockResolvedValue({ plan: 'decouverte', accounts_used: 0 })
    h.consumePreLoginTarget.mockReturnValue(null)
    sessionUser = null
    preferencesDefaultView = 'chat'
  })

  it("ne rebondit qu'une fois, même si l'objet user est remplacé à chaque rendu", async () => {
    sessionUser = freshUser()
    const { rerender } = renderHook(() => useRedirectAfterAuth())
    await waitFor(() => expect(h.navigate).toHaveBeenCalledTimes(1))

    // Cinq diffusions d'un autre onglet : même utilisateur, objets différents.
    for (let i = 0; i < 5; i += 1) {
      sessionUser = freshUser()
      rerender()
    }
    await waitFor(() => expect(h.navigate).toHaveBeenCalledTimes(1))
  })

  it('envoie un compte au questionnaire quand il est réellement neuf', async () => {
    sessionUser = freshUser()
    renderHook(() => useRedirectAfterAuth())
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: '/onboarding', replace: true }))
  })

  // #1786 — le retour, mot pour mot : « quand on se connecte à Bellum, c'est
  // sur Laura qu'on doit arriver par défaut, plus le tableau de bord ». Cette
  // connexion est par MOT DE PASSE (`useRedirectAfterAuth`, pas le rebond
  // OAuth). Personne n'a jamais touché Réglages › Démarrage ⇒ le défaut
  // s'applique.
  it('après une connexion par mot de passe, un compte déjà onboardé atterrit chez Laura, plus au tableau de bord (#1786)', async () => {
    h.getState.mockResolvedValue({ status: 'completed' })
    sessionUser = freshUser()
    renderHook(() => useRedirectAfterAuth())
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: '/chat', replace: true }))
  })

  // #1786 — une correction humaine gagne toujours : un choix déjà posé dans
  // Réglages n'est jamais écrasé par le nouveau défaut.
  it('garde le choix DÉJÀ fait dans Réglages (Comptes) — une correction humaine gagne toujours (#1786)', async () => {
    preferencesDefaultView = 'accounts'
    h.getState.mockResolvedValue({ status: 'completed' })
    sessionUser = freshUser()
    renderHook(() => useRedirectAfterAuth())
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: '/accounts', replace: true }))
  })

  // #1786 — l'onboarding inachevé garde la priorité, même quand la
  // destination normale serait désormais Laura.
  it("l'onboarding inachevé garde la priorité sur la destination normale, même Laura (#1786)", async () => {
    preferencesDefaultView = 'chat'
    h.getState.mockResolvedValue({ status: 'not_started' })
    sessionUser = freshUser()
    renderHook(() => useRedirectAfterAuth())
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: '/onboarding', replace: true }))
  })

  it("propose le questionnaire à un compte servi qui n'y a jamais répondu (§13)", async () => {
    // Palier Découverte ET une analyse déjà consommée. Cette destination était
    // `/dashboard` : « ce compte a été servi, donc il a répondu ». Les deux faits
    // n'ont rien à voir — un compte bêta est provisionné avec un palier AVANT la
    // première question — et le raccourci contredisait le garde de la page
    // client, qui renvoyait le même compte vers `/onboarding`. C'est ce
    // désaccord qui faisait l'aller-retour. Les deux lisent maintenant
    // `needsOnboarding`, donc la destination est stable : le questionnaire, dont
    // « Plus tard » est la sortie explicite.
    h.getCredits.mockResolvedValue({ plan: 'decouverte', accounts_used: 1 })
    sessionUser = freshUser()
    renderHook(() => useRedirectAfterAuth())
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: '/onboarding', replace: true }))
  })

  it('respecte un report explicite du questionnaire — pas de renvoi vers un écran refusé', async () => {
    preferencesDefaultView = 'accounts'
    h.getState.mockResolvedValue({ status: 'in_progress', skipped_at: '2026-08-01T09:00:00Z' })
    h.getCredits.mockResolvedValue({ plan: 'growth', accounts_used: 3 })
    sessionUser = freshUser()
    renderHook(() => useRedirectAfterAuth())
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: '/accounts', replace: true }))
  })

  it('dépose le visiteur de démonstration dans le produit', async () => {
    preferencesDefaultView = 'accounts'
    h.getCredits.mockResolvedValue({ plan: 'beta', accounts_used: 0, is_demo: true })
    sessionUser = freshUser()
    renderHook(() => useRedirectAfterAuth())
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: '/accounts', replace: true }))
  })

  it("ne navigue jamais tant que personne n'est connecté", async () => {
    renderHook(() => useRedirectAfterAuth())
    await new Promise(r => setTimeout(r, 10))
    expect(h.navigate).not.toHaveBeenCalled()
  })

  // #2145.7 — un lien profond ouvert sans session (compte, notification par
  // e-mail) gagne sur la destination générique une fois la connexion faite.
  it('un lien partagé ouvert avant connexion ramène sur l’objet exact, pas sur la destination générique (#2145.7)', async () => {
    h.getState.mockResolvedValue({ status: 'completed' })
    h.consumePreLoginTarget.mockReturnValue('/accounts/acc-1?tab=contacts')
    sessionUser = freshUser()
    renderHook(() => useRedirectAfterAuth())
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: '/accounts/acc-1?tab=contacts', replace: true }))
  })

  // #2145.8 — ne jamais détourner un compte qui a BESOIN du questionnaire :
  // un lien profond ne court-circuite pas l'onboarding.
  it('un lien partagé ne court-circuite jamais un onboarding inachevé (#2145.7 vs #2145.8)', async () => {
    h.getState.mockResolvedValue({ status: 'not_started' })
    h.consumePreLoginTarget.mockReturnValue('/accounts/acc-1')
    sessionUser = freshUser()
    renderHook(() => useRedirectAfterAuth())
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: '/onboarding', replace: true }))
  })

  // 14/10/2026 — la connexion OAuth MCP bouclait : l'API (issuer = hôte Railway)
  // renvoie vers `/login?returnTo=<railway>/oauth/authorize…`. Déjà connecté, le
  // hook ignorait cette origine et atterrissait sur /chat, sans jamais revenir.
  describe('returnTo OAuth MCP', () => {
    const API = 'https://api.bellum-ai.com'
    const RAILWAY = 'https://belllum-backend-service-production.up.railway.app'
    const QS = '/oauth/authorize?client_id=c1&state=s'
    const assign = vi.fn()
    const originalLocation = window.location

    function openLogin(returnTo: string) {
      window.history.replaceState({}, '', `/login?returnTo=${encodeURIComponent(returnTo)}`)
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...originalLocation, search: window.location.search, assign },
      })
    }

    beforeEach(() => {
      assign.mockClear()
      vi.stubEnv('VITE_API_URL', API)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ issuer: RAILWAY }) }))
    })

    afterEach(() => {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
      window.history.replaceState({}, '', '/')
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
    })

    it('un returnTo sur l’issuer (Railway) ramène la navigation sur l’origine de l’API, pas sur /chat', async () => {
      openLogin(`${RAILWAY}${QS}`)
      sessionUser = freshUser()
      renderHook(() => useRedirectAfterAuth())
      await waitFor(() => expect(assign).toHaveBeenCalledWith(`${API}${QS}`))
      expect(h.navigate).not.toHaveBeenCalled()
    })

    it('un returnTo sur l’origine de l’API est honoré sans interroger les métadonnées', async () => {
      openLogin(`${API}${QS}`)
      sessionUser = freshUser()
      renderHook(() => useRedirectAfterAuth())
      await waitFor(() => expect(assign).toHaveBeenCalledWith(`${API}${QS}`))
      expect(fetch).not.toHaveBeenCalled()
    })

    it('un returnTo sur une origine arbitraire est ignoré : atterrissage normal, aucune redirection ouverte', async () => {
      openLogin(`https://evil.example${QS}`)
      sessionUser = freshUser()
      renderHook(() => useRedirectAfterAuth())
      await waitFor(() => expect(h.navigate).toHaveBeenCalledTimes(1))
      expect(assign).not.toHaveBeenCalled()
    })
  })
})
