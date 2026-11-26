// Client pour la lecture agrégée des demandes que Laura n'a pas su router
// (GET /internal/analytics/laura-unrouted-intents, gardé par InternalSecretGuard).
// Server-side only — le secret interne ne doit jamais atteindre le navigateur.
//
// #1949.23 — décision Louis 13/09 batch 12. Même patron que
// `onboarding-funnel.client.ts` : fetch côté serveur, `x-internal-secret`,
// jamais de cache. Les formes ci-dessous sont un MIROIR de
// `LauraUnroutedIntentsReport` (`apps/api/src/modules/laura-unrouted-intents/
// laura-unrouted-intents.service.ts`) — les deux applications se déploient
// séparément, un import direct entre elles n'existe pas.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

/** Un groupe publié : le plancher d'occurrences distinctes est DÉJÀ appliqué par l'API. */
type GroupeNonCompris = {
  /** Le texte de la demande, masqué par le moteur IA et tronqué à 300 caractères. */
  text: string
  occurrences: number
  /** Occurrences DISTINCTES — (espace, jour) hachés côté API, jamais des lignes. */
  distinctOccurrences: number
  surfaces: string[]
  categories: string[]
  languages: string[]
}

export type RapportNonCompris = {
  windowDays: number
  minDistinctOccurrences: number
  /** `null` = compte illisible côté API — jamais « 0 ». */
  recorded: number | null
  groups: GroupeNonCompris[]
  /** Groupes retenus sous le plancher : un COMPTE, jamais leur texte. */
  withheldGroups: number
  computedAt: string
}

export async function fetchUnroutedIntents(days?: number): Promise<RapportNonCompris> {
  const url = new URL('/internal/analytics/laura-unrouted-intents', REAL_BASE)
  if (days !== undefined) url.searchParams.set('days', String(days))
  const res = await fetch(url, { headers: { 'x-internal-secret': REAL_SECRET }, cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`laura-unrouted-intents endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as RapportNonCompris
}
