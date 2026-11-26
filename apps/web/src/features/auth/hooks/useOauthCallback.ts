import { useQuery } from '@tanstack/react-query'
import { TechnicalError } from '@bellum/errors'
import { sessionManager } from '@/features/auth/session-manager'
import { resolveLandingFrom, type LandingContext } from '@/features/auth/lib/post-auth-landing'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { creditsApi } from '@/features/credits/api'
import { onboardingApi } from '@/features/onboarding/api'
import { profileApi } from '@/features/profiles/api'
import { useReadPreferences } from '@/features/preferences/preferences-provider'

type OauthCallbackResult = {
  onboardingCompleted: boolean
}

type CachedTokens = { accessToken: string; refreshToken: string }

// Read the hash ONCE — the first time `consumeOauthHash()` is called — and
// cache the result at module scope. React 18 StrictMode double-invokes the
// query's `queryFn` in dev; caching here means the second call sees the
// same tokens instead of an empty hash (which we strip after the first read).
let cachedTokens: CachedTokens | null | undefined

function consumeOauthHash(): CachedTokens | null {
  if (cachedTokens !== undefined) return cachedTokens
  if (typeof window === 'undefined') {
    cachedTokens = null
    return null
  }
  const raw = window.location.hash
  const hash = raw.startsWith('#') ? raw.slice(1) : ''
  const params = new URLSearchParams(hash)
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (!accessToken || !refreshToken) {
    cachedTokens = null
    return null
  }
  cachedTokens = { accessToken, refreshToken }
  // Strip the hash now that we've captured the tokens so they don't linger
  // in history or leak into Referer headers.
  window.history.replaceState(null, '', window.location.pathname)
  return cachedTokens
}

/**
 * Consumes the Supabase OAuth redirect hash, forwards the tokens to the
 * session manager, fetches the profile, then navigates to `/dashboard` or
 * `/onboarding` depending on onboarding status.
 *
 * `useQuery` auto-runs on mount and dedupes concurrent calls by `queryKey`,
 * so StrictMode's double-render does NOT produce duplicate backend POSTs.
 * Navigation happens inside `queryFn` (via the router singleton) so the
 * component consuming this hook doesn't need a `useEffect` to react to the
 * data — it just renders loading/error states.
 *
 * `gcTime: 0` keeps this query out of the IndexedDB persister: on a fresh
 * OAuth callback (e.g. logout → re-login), we MUST re-run the exchange
 * with the new tokens. A persisted result would short-circuit the
 * `queryFn` and skip the navigation, leaving the user stuck on the loader.
 *
 * #1786 — `isMobile`/`defaultView` sont lus ICI, au rendu du composant, et
 * capturés par la fermeture de `queryFn` : la même paire que lit `HomePage`,
 * pour que `resolveLandingFrom` applique la même dérivation
 * (`resolveDefaultLandingRoute`) des deux côtés de la connexion.
 */
export function useOauthCallback() {
  const isMobile = useIsMobile()
  const { defaultView } = useReadPreferences()
  return useQuery<OauthCallbackResult, Error>({
    queryKey: ['oauth-callback'],
    queryFn: async () => {
      const tokens = consumeOauthHash()
      if (!tokens) {
        throw new TechnicalError('Tokens OAuth manquants')
      }
      await sessionManager.handleOauthCallback(tokens.accessToken, tokens.refreshToken)
      // Materialize the profile row (the API auto-creates on first GET) so
      // it lands in the cache before any onboarding view mounts.
      await profileApi.getMe()
      // L'état RÉEL du compte décide, et par le même calcul que la connexion
      // par mot de passe. Le TODO qui vivait ici forçait `/onboarding` pour
      // TOUT le monde : un utilisateur déjà installé, dont le compte et le
      // palier s'affichaient à l'écran, se faisait redemander qui il était à
      // chaque connexion Google. Une lecture en échec ne conclut rien — elle
      // renvoie vers la destination normale, dont le garde d'onboarding refait
      // la lecture.
      const [state, credits] = await Promise.all([
        onboardingApi.getState().catch(() => null),
        creditsApi.getMine().catch(() => null),
      ])
      const landing: LandingContext = { isMobile, defaultView }
      const target = resolveLandingFrom(state, credits, landing)
      const onboardingCompleted = target !== '/onboarding'
      // Chargé ICI, pas en haut du fichier : `@/router` importe `routeTree.gen`,
      // donc TOUTES les routes. Un import statique ferme un cycle dès qu'un
      // composant de l'arbre utilise ce hook (mesuré le 18/09/2026, garde
      // `a-hook-in-the-route-tree-never-imports-the-router`).
      void import('@/router').then(({ router }) => {
        router.navigate({ to: target, replace: true })
      })
      return { onboardingCompleted }
    },
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}
