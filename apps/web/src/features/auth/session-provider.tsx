import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { GlobalLoadingState } from '@/components/GlobalLoadingState'
import { SessionContext, type SessionContextValue } from './session-context'
import { sessionManager } from './session-manager'
import { useCurrentUserStore } from '@/stores/currentUserStore'
import { ensureApiReachable } from '@/lib/api-origin'

// The OAuth callback page (`/auth/callback`) drives its own session
// hydration via `useOauthCallback` — gating it on `loadSession` would
// deadlock the loader if a stale `loggedIn:` cookie makes `/auth/refresh`
// hang. Detect it BEFORE kicking off `loadSession` so we never even try.
const isOauthCallbackPath = typeof window !== 'undefined' && window.location.pathname === '/auth/callback'

// #3578 (recette Z1 04/10) — `/demo/acces` est la porte d'un visiteur ANONYME : son formulaire n'attend rien de la
// session. Tant qu'elle s'hydratait, l'écran restait noir ~10 s (API occupée à re-semer une salle) avant de montrer le
// formulaire. Même traitement que le callback OAuth : on rend les enfants tout de suite, `loading` reste vrai dans le
// contexte pour qui veut savoir (`SessionContent` rend l'`<Outlet />` tant qu'il n'y a pas d'utilisateur).
const isAnonymousEntryPath = typeof window !== 'undefined' && window.location.pathname === '/demo/acces'

// Kick off the initial session resolution at module load — before React
// renders — so the first render sees either an authenticated user or a
// definitively anonymous state. Skip on `/auth/callback`: the OAuth flow
// will call `applySession` itself once the backend exchange completes.
//
// ⚠️ La sonde d'accessibilité passe AVANT, et l'ordre est le point.
//
// Derrière une passerelle d'entreprise qui bloque le domaine de l'API, le tout
// premier appel échoue en « Failed to fetch » — y compris la connexion, qui est
// un POST et ne peut donc pas armer le repli sans risquer d'écrire deux fois.
// La sonde touche `/version` et décide de l'origine une bonne fois, avant que
// quoi que ce soit d'autre ne parte. Voir `lib/api-origin.ts`.
//
// Elle ne rejette jamais. Depuis P3 elle n'est plus DEVANT la session (voir ci-dessous).
if (!isOauthCallbackPath) {
  // perf P3 (29/09/2026) — sonde et session partent au MÊME tick : attendre
  // `/version` avant `/auth/session` coûtait un aller-retour à chaque page.
  // Le repli reste assuré : `/auth/session` est un GET, `apiFetch` le rejoue
  // lui-même par `/api` sur un échec de transport et arme le repli.
  void ensureApiReachable()
  void sessionManager.loadSession()
}

function subscribe(listener: () => void): () => void {
  return sessionManager.subscribe(listener)
}

function getSnapshot() {
  return sessionManager.getState()
}

/**
 * Resolves the initial session at mount and injects the context for
 * downstream consumers (via `useSession()`). While the session hydrates we
 * render the global loading state so no downstream component sees an
 * ambiguous "undefined user" moment. On `/auth/callback` we render children
 * immediately — the OAuth callback hook owns the loader state there.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const setCurrentUser = useCurrentUserStore(s => s.setCurrentUser)

  useEffect(() => {
    setCurrentUser(state.user)
  }, [state.user, setCurrentUser])

  if (state.loading && !isOauthCallbackPath && !isAnonymousEntryPath) return <GlobalLoadingState />

  const value: SessionContextValue = {
    user: state.user,
    loading: state.loading,
  }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
