import type { SessionResponse } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { ApiError } from '@/lib/api-error'
import {
  DEMO_PREPARING_CODE,
  DEMO_PREPARING_MAX_MS,
  DEMO_REDEEM_TIMEOUT_MS,
  DEMO_TOUCH_TIMEOUT_MS,
  DemoTimeoutError,
  withDemoDeadline,
} from './demo-timeout'
import type { DemoProfile } from './demo-profile'

export type DemoLeadJobTitle =
  | 'business_developer'
  | 'manager'
  | 'agency_director'
  | 'sales_director'
  | 'esn_founder'
  | 'freelance'
  | 'other'

type DemoLeadPayload = {
  firstName: string
  lastName: string
  email: string
  jobTitle: DemoLeadJobTitle
  company: string
  phone?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  utmContent?: string
}

type DemoLeadTouchResult = { found: boolean; firstName?: string }

/**
 * HTTP client for the SHARED demo link (`/demo?t=…`) and its formulaire
 * obligatoire (#2705).
 *
 * `redeem` wipes and re-seeds the demo workspace, then sets the session
 * cookies server-side (the tokens never reach JS — same interceptor as a
 * password login). `registerLead`/`leadTouch` never touch a room: they only
 * ever write to `demo_leads`, which no demo workspace reads.
 */
/** Le serveur dit « aucune salle à jour n'est prête, un re-semis d'arrière-plan court » (#3578) ;
 *  rend le délai avant de redemander, ou `null` pour toute autre erreur. */
function preparingRetryMs(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.status !== 503 || error.code !== DEMO_PREPARING_CODE) return null
  const seconds = (error.details as { retryAfterSeconds?: unknown } | undefined)?.retryAfterSeconds
  // Plancher à 5 s : la route est limitée à 5 appels/min, un délai absurde ne doit pas la marteler.
  return typeof seconds === 'number' && Number.isFinite(seconds) ? Math.max(5, seconds) * 1000 : 15_000
}

export const demoApi = {
  /** `token` n'existe que sur un environnement verrouillé (`DEMO_LINK_TOKEN`) —
   *  le lien normal est nu (`/demo`) et n'en porte aucun.
   *
   *  #3578 — un re-semis après déploiement dure ~70 s ; le serveur ne le fait plus dans
   *  la requête du visiteur : il répond « en préparation » (503 nommé) et ce client
   *  redemande seul, `onPreparing` laissant l'écran le dire. Chaque tentative reste
   *  bornée (90 s), l'ensemble aussi (5 min). */
  async redeem(
    token?: string,
    opts: { onPreparing?: () => void; profile?: DemoProfile } = {},
  ): Promise<SessionResponse> {
    const startedAt = Date.now()
    // #4291 J — la démo forfait / conseil : même route, même jeton ; sans profil, le corps d'avant à l'octet.
    const body = { ...(token ? { token } : {}), ...(opts.profile ? { profile: opts.profile } : {}) }
    for (;;) {
      try {
        return await withDemoDeadline(
          signal =>
            apiFetch<SessionResponse, { token?: string; profile?: DemoProfile }>({
              path: '/demo/session',
              method: 'POST',
              body,
              signal,
            }),
          DEMO_REDEEM_TIMEOUT_MS,
        )
      } catch (error) {
        const retryMs = preparingRetryMs(error)
        if (retryMs === null) throw error
        if (Date.now() - startedAt + retryMs > DEMO_PREPARING_MAX_MS) throw new DemoTimeoutError()
        opts.onPreparing?.()
        await new Promise<void>(resolve => setTimeout(resolve, retryMs))
      }
    }
  },

  /** #2705.4 — enregistre le prospect. Dédupliqué par e-mail côté serveur :
   *  soumettre deux fois la même adresse ne crée jamais une seconde ligne. */
  registerLead(payload: DemoLeadPayload): Promise<{ firstName: string }> {
    return apiFetch<{ firstName: string }, DemoLeadPayload>({
      path: '/demo/lead',
      method: 'POST',
      body: payload,
    })
  },

  /** #2705.6 — le visiteur qui revient : le cookie `bellum_did` porte-t-il
   *  déjà un lead ? `found: false` dit au formulaire de s'afficher. */
  leadTouch(): Promise<DemoLeadTouchResult> {
    return withDemoDeadline(
      signal =>
        apiFetch<DemoLeadTouchResult, Record<string, never>>({
          path: '/demo/lead/touch',
          method: 'POST',
          body: {},
          signal,
        }),
      DEMO_TOUCH_TIMEOUT_MS,
    )
  },
}
