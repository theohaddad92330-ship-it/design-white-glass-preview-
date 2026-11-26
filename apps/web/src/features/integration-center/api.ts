import type { ConnectedTool, IntegrationSyncRun } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { ApiError } from '@/lib/api-error'

/**
 * La lecture unique de l'écran Intégrations.
 *
 * Le registre (`/tool-registry`) est la vue déjà agrégée côté API par-dessus les
 * silos de connexion — c'est lui qui sait ce que CE serveur est en mesure
 * d'offrir, et donc ce que l'écran a le droit de montrer.
 *
 * Le journal de livraison des webhooks se lisait ici aussi : il est parti au
 * back-office. Un code HTTP et un numéro de tentative sont du diagnostic, et
 * l'utilisateur n'a aucun geste à en tirer que le bouton « Tester » de la carte
 * ne lui donne déjà.
 */
/** Ce qu'une capacité vérifiée rend — un NOM d'objet, jamais un contenu. */
export type CapabilityProbeResult = {
  key: string
  label: string
  ok: boolean
  sample: string | null
  errorCode: string | null
  missingScopes: string[]
  probeable: boolean
}

export type ConnectorRepair = {
  provider: string
  missingScopes: string[]
  /** Vrai : l'app publiée ne propose pas la portée (consentement neuf) — reconnecter ne répare rien. */
  appSide: boolean
  reason: string
  exactAction: string
  blockedCapabilities: string[]
  neverDoes: string[]
  dependentRoutines: string[]
}

export const integrationCenterApi = {
  registry(): Promise<ConnectedTool[]> {
    return apiFetch<ConnectedTool[]>({ path: '/tool-registry' })
  },
  /** Une LECTURE réelle par capacité. N'écrit rien, n'envoie rien. */
  test(provider: string): Promise<{ provider: string; results: CapabilityProbeResult[] }> {
    return apiFetch({ path: `/tools/${encodeURIComponent(provider)}/test`, method: 'POST' })
  },
  /** SCOPES-I.2 — l'écart de portées de l'utilisateur pour ce connecteur, ou `null`. */
  async scopeGap(provider: string): Promise<{ label: string; missingScopes: string[]; freshConsent: boolean } | null> {
    const { gap } = await apiFetch<{
      gap: { label: string; missingScopes: string[]; freshConsent: boolean } | null
    }>({ path: `/tools/${encodeURIComponent(provider)}/scope-gap` })
    return gap
  },
  repair(provider: string): Promise<ConnectorRepair> {
    return apiFetch({ path: `/tools/${encodeURIComponent(provider)}/repair` })
  },
  /** #2207.19 — le geste derrière « Synchroniser et comprendre mes données ». */
  startSync(provider: string): Promise<IntegrationSyncRun> {
    return apiFetch({ path: `/tools/${encodeURIComponent(provider)}/sync-runs`, method: 'POST' })
  },
  /** Le polling — jusqu'à `completed`/`failed`. */
  syncRun(provider: string, id: string): Promise<IntegrationSyncRun> {
    return apiFetch({ path: `/tools/${encodeURIComponent(provider)}/sync-runs/${encodeURIComponent(id)}` })
  },
  /** Le dernier run de ce connecteur — `null` quand aucun n'a jamais été lancé
   *  (404 côté serveur, jamais une erreur à l'écran). */
  async latestSyncRun(provider: string): Promise<IntegrationSyncRun | null> {
    try {
      return await apiFetch<IntegrationSyncRun>({ path: `/tools/${encodeURIComponent(provider)}/sync-runs/latest` })
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null
      throw error
    }
  },
  /** #2110.39 — le bouton « Annuler », quand techniquement possible. */
  cancelSync(provider: string, id: string): Promise<IntegrationSyncRun> {
    return apiFetch({
      path: `/tools/${encodeURIComponent(provider)}/sync-runs/${encodeURIComponent(id)}/cancel`,
      method: 'POST',
    })
  },
}

/** Le dernier résumé de synchronisation d'un connecteur, s'il y en a un —
 *  affiché sur la carte connectée sans que l'utilisateur n'ait à recliquer. */
export function useLatestSyncRun(provider: string, enabled: boolean) {
  return useQuery({
    queryKey: ['integration-sync', 'latest', provider],
    queryFn: () => integrationCenterApi.latestSyncRun(provider),
    enabled,
  })
}

/**
 * SCOPES-I.2 — la portée manquante est-elle celle de l'app (consentement neuf) ou d'un accord ancien ?
 * Sans écart, ou sur une erreur, `false` : la carte garde son « reconnecte » habituel.
 */
export function useScopeGapIsAppSide(provider: string, enabled: boolean): boolean {
  const { data } = useQuery({
    queryKey: ['integration-scope-gap', provider],
    queryFn: () => integrationCenterApi.scopeGap(provider),
    enabled,
    retry: false,
  })
  return data?.freshConsent === true
}

export const TOOL_REGISTRY_KEY = ['tool-registry'] as const

/**
 * perf P3 (29/09/2026) — UNE clé pour tout le registre (`GET /tool-registry`).
 * Le gabarit de chaque page (`useRouteAccess`) le lisait avec
 * `refetchOnMount: 'always'` et le chat le lisait sous une AUTRE clé : deux
 * appels par page. Par défaut, cache de 30 s, partagé.
 *
 * `fresh` : l'écran Intégrations est celui où l'on vient VÉRIFIER qu'une
 * réparation a pris — un état de panne qui survit à sa réparation est le pire
 * défaut possible sur cette page-là (piège n°4 du PDF 7). Lui seul force la
 * relecture ; les réparations invalident déjà `TOOL_REGISTRY_KEY` pour les autres.
 */
export function useToolRegistry(options: { fresh?: boolean } = {}) {
  return useQuery({
    queryKey: TOOL_REGISTRY_KEY,
    queryFn: integrationCenterApi.registry,
    staleTime: options.fresh ? 0 : 30_000,
    refetchOnMount: options.fresh ? 'always' : true,
  })
}
