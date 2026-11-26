import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type { UserProfile } from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { profileApi } from '@/features/profiles/api'
import { creditsApi } from '@/features/credits/api'
import { onboardingApi } from '@/features/onboarding/api'
import { resolveLandingFrom, type LandingContext } from '@/features/auth/lib/post-auth-landing'
import { consumePreLoginTarget } from '@/features/auth/lib/pre-login-target'
import { fetchOauthIssuer, resolveOauthReturnTo } from '@/features/auth/lib/oauth-return-to'
import { useReadPreferences } from '@/features/preferences/preferences-provider'
import { PENDING_INVITATION_KEY } from '@/features/team/pending-invitation'

/** A pending workspace invitation (stashed by the accept page before the login
 *  round-trip) wins over the default landing — bounce the user back to it. */
function consumePendingInvitation(): boolean {
  let token: string | null = null
  try {
    token = localStorage.getItem(PENDING_INVITATION_KEY)
    if (token) localStorage.removeItem(PENDING_INVITATION_KEY)
  } catch {
    return false
  }
  if (!token) return false
  // Chargé ICI, pas en haut du fichier : `@/router` importe `routeTree.gen`,
  // donc TOUTES les routes. Un import statique ferme un cycle dès qu'un
  // composant de l'arbre utilise ce hook (mesuré le 18/09/2026, garde
  // `a-hook-in-the-route-tree-never-imports-the-router`).
  void import('@/router').then(({ router }) => {
    router.navigate({ to: '/invitation/$token', params: { token }, replace: true })
  })
  return true
}

/**
 * If a `returnTo` is present and is the MCP OAuth `/oauth/authorize` URL, we hand
 * the freshly-authenticated browser back to it via a FULL-PAGE navigation (not an
 * SPA push) so the API-host session cookie rides along. Allow-listed to the API
 * origin and the issuer the API itself announces — never an open redirect — and
 * always re-based on the API origin (see `resolveOauthReturnTo`). The issuer is
 * only fetched when the origin differs, so the common path stays synchronous.
 */
async function consumeApiReturnTo(): Promise<boolean> {
  const returnTo = new URLSearchParams(window.location.search).get('returnTo')
  if (!returnTo) return false
  let apiOrigin: string
  try {
    apiOrigin = new URL(import.meta.env.VITE_API_URL || 'http://localhost:3000').origin
  } catch {
    return false
  }
  let target = resolveOauthReturnTo(returnTo, apiOrigin, null)
  if (!target) target = resolveOauthReturnTo(returnTo, apiOrigin, await fetchOauthIssuer(apiOrigin))
  if (!target) return false
  window.location.assign(target)
  return true
}

/**
 * Où atterrit ce compte ?
 *
 * Même prédicat que les gardes de `/onboarding` et `/onboarding/plan` : un
 * questionnaire terminé, un palier déjà servi ou une analyse déjà consommée
 * veulent dire « ce compte a été servi » ⇒ dashboard. Tout le reste est un vrai
 * nouveau venu ⇒ questionnaire. Avant, la destination était **toujours**
 * `/onboarding` (un raccourci d'avant-lancement assumé dans un TODO) : un compte
 * établi repartait donc dans le questionnaire à chaque connexion, et se faisait
 * renvoyer au dashboard par le garde de #762 — l'aller-retour qui nourrissait la
 * boucle.
 *
 * Une lecture en échec n'invente rien : elle laisse le garde de destination
 * trancher, puisqu'il refait la même lecture.
 *
 * #1786 — la destination normale (hors onboarding) n'est plus `/dashboard` en
 * dur : `landing` porte le mobile et la préférence de démarrage, lus UNE fois
 * par le hook appelant, pour que `resolveLandingFrom` applique la même
 * dérivation que `HomePage` (`resolveDefaultLandingRoute`).
 */
async function resolveLanding(qc: QueryClient, userId: string, landing: LandingContext): Promise<string> {
  try {
    // Warm the profile cache — every screen downstream reads it. Un échec ici
    // signalait déjà « ne tente pas l'onboarding » dans la version précédente.
    await qc.fetchQuery<UserProfile>({
      queryKey: ['profile', 'me', userId],
      queryFn: () => profileApi.getMe(),
      staleTime: 60_000,
    })
  } catch {
    return resolveLandingFrom(null, null, landing)
  }

  const [state, credits] = await Promise.all([
    onboardingApi.getState().catch(() => null),
    creditsApi.getMine().catch(() => null),
  ])

  // Même calcul que le rebond OAuth, au même endroit : les deux portes d'entrée
  // ne peuvent plus conclure différemment sur le même compte. L'espace de
  // démonstration et le report explicite sont traités dans `needsOnboarding`.
  const normal = resolveLandingFrom(state, credits, landing)
  // #2145.7 — un lien profond (compte, notification) ouvert sans session
  // gagne sur la destination NORMALE, jamais sur l'onboarding (#2145.8) : un
  // compte qui a réellement besoin du questionnaire n'est pas court-circuité
  // par un lien profond.
  if (normal === '/onboarding') return normal
  return consumePreLoginTarget() ?? normal
}

/**
 * Rebond post-authentification : une fois la session résolue, on quitte l'écran
 * de connexion pour le dashboard ou le questionnaire, selon l'état réel du
 * compte.
 *
 * **Une seule fois par identité.** Le `SessionManager` republie un objet `user`
 * neuf à chaque `session-applied` — y compris ceux diffusés par un AUTRE onglet
 * via le `BroadcastChannel`. Sans ce verrou, l'effet refire à chaque diffusion
 * et chaque `navigate` annule le `beforeLoad` en vol de la route cible : c'est
 * la boucle qui a mis la prod à genoux le 23/07 (~160 `GET /onboarding/state`
 * en 3 s → 429 → écran « Oups »). Le repère se remet à zéro à la déconnexion,
 * pour qu'une reconnexion rebondisse normalement.
 */
export function useRedirectAfterAuth({ enabled = true }: { enabled?: boolean } = {}): void {
  const { user } = useSession()
  const qc = useQueryClient()
  const redirectedFor = useRef<string | null>(null)
  // #1786 — lus UNE fois par rebond, comme `HomePage` : mobile et préférence
  // de démarrage décident de la destination « normale » (voir `resolveLanding`).
  const isMobile = useIsMobile()
  const { defaultView } = useReadPreferences()

  useEffect(() => {
    if (!user) {
      redirectedFor.current = null
      return
    }
    // #3788 — `/login` ferme d'abord la session démo : pas de rebond dessus.
    if (!enabled) return
    if (redirectedFor.current === user.id) return
    redirectedFor.current = user.id

    // An in-progress MCP OAuth authorize (returnTo) hands the browser straight
    // back to the API; otherwise a stashed team invitation wins over the default
    // dashboard/onboarding landing.
    let cancelled = false
    const landing: LandingContext = { isMobile, defaultView }
    void consumeApiReturnTo().then(handedBack => {
      if (handedBack || cancelled) return
      if (consumePendingInvitation()) return
      return resolveLanding(qc, user.id, landing).then(target => {
        if (cancelled) return
        // Chargé ICI, pas en haut du fichier : `@/router` importe `routeTree.gen`,
        // donc TOUTES les routes. Un import statique ferme un cycle dès qu'un
        // composant de l'arbre utilise ce hook (mesuré le 18/09/2026, garde
        // `a-hook-in-the-route-tree-never-imports-the-router`).
        void import('@/router').then(({ router }) => {
          router.navigate({ to: target, replace: true })
        })
      })
    })

    return () => {
      cancelled = true
    }
  }, [user, qc, isMobile, defaultView, enabled])
}
