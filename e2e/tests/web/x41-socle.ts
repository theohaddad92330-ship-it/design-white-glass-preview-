import type { Page, Route } from '@playwright/test'

/**
 * Socle commun des parcours dorés du lot X41 (#2958, 02/10) : une session
 * « établie » (onboarding terminé, espace de travail, offre donnée par
 * `features`), le filet des appels d'API non mockés, et `json`.
 *
 * Ce fichier est NEUF (les lots parallèles ont leur propre socle) : aucun
 * spec existant ne l'importe, aucun ne dépend de lui hors X41.
 *
 * Le filet : toute requête vers l'API morte du build e2e (port 4599) que le
 * parcours n'a pas mockée est notée dans `unmocked` ET répondue 404 — jamais
 * une réponse inventée (« jamais de donnée fictive »). Un parcours qui veut
 * prouver « aucun 404 silencieux » asserte `unmocked` vide.
 */

export const WEB_ORIGIN = 'http://127.0.0.1:4311'
export const API_ORIGIN = 'http://127.0.0.1:4599'

export const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

/** Une URL d'écran (origine du SPA) n'est pas un appel d'API. */
export const isPage = (route: Route) => route.request().resourceType() === 'document'

type SessionOptions = {
  /** Offre : clés renvoyées par `GET /credits`. */
  features: string[]
  /** Numéro de parcours (3 derniers chiffres de l'identifiant utilisateur). */
  tag: string
  role?: 'owner' | 'member' | 'viewer'
  workspaceName?: string
  /** Réponse de `GET /credits` (champs en plus de `features`). */
  credits?: Record<string, unknown>
  /** #4158.9 — membres actifs (`GET /workspaces/me`) ; l'entrée « Équipe » de
   *  la barre n'existe qu'à partir de deux. Défaut : espace solo. */
  memberCount?: number
}

export async function mockSession(page: Page, options: SessionOptions): Promise<{ unmocked: string[] }> {
  const unmocked: string[] = []
  const userId = `41000000-0000-4000-8000-000000000${options.tag.padStart(3, '0')}`
  // Filet d'abord : Playwright donne la priorité à la DERNIÈRE route posée.
  await page.route(`${API_ORIGIN}/**`, route => {
    unmocked.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    return json(route, { message: 'non mocké (x41)' }, 404)
  })
  await page.context().addCookies([{ name: `loggedIn:${userId}`, value: '1', url: WEB_ORIGIN }])
  await page.route('**/auth/session', route =>
    isPage(route)
      ? route.fallback()
      : json(route, {
          user: {
            id: userId,
            email: `e2e-x41-${options.tag}@bellum-ai.com`,
            created_at: '2026-01-01T00:00:00.000Z',
            roles: ['customer'],
          },
        }),
  )
  await page.route('**/onboarding/state', route =>
    json(route, {
      id: userId,
      status: 'completed',
      current_stage_code: null,
      stages: [],
      answers: {},
      skipped_at: null,
      inherited_answer_keys: [],
      active_import_session_id: null,
      joined_workspace: null,
      effectif_observed_at: {},
    }),
  )
  await page.route('**/workspaces/me', route =>
    json(route, {
      workspace: {
        id: `9b1c2d3e-4f50-4a61-8b72-41000000${options.tag.padStart(4, '0')}`,
        name: options.workspaceName ?? 'ESN e2e',
        role: options.role ?? 'owner',
        memberCount: options.memberCount ?? 1,
      },
      members: [],
    }),
  )
  await page.route('**/credits', route =>
    isPage(route) ? route.fallback() : json(route, { features: options.features, ...options.credits }),
  )
  return { unmocked }
}
