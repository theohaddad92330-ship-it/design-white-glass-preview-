import { technologyRadarSchema, type TechnologyRadar } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #4282.10 — le radar d'une technologie, la MÊME sortie que Laura (`technology_radar`
 * côté IA) relayée par `POST /ia/discover/technology-radar`. Revalidée ici contre le
 * schéma strict du contrat : une sortie hors contrat est une erreur, jamais un écran
 * qui afficherait une probabilité ou une source.
 */
export async function fetchTechnologyRadar(technology: string, signal?: AbortSignal): Promise<TechnologyRadar> {
  const raw = await apiFetch<unknown>({
    path: '/ia/discover/technology-radar',
    method: 'POST',
    body: { technology },
    signal,
  })
  // Même tolérance que `discover-api.ts` : à plat, ou enveloppé dans `{ success, data }`.
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
  const payload = record && !('technology' in record) && record['data'] ? record['data'] : raw
  return technologyRadarSchema.parse(payload)
}
