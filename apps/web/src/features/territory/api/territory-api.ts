import {
  TERRITORY_MAX_RADIUS_KM,
  type TerritoryCommune,
  type TerritoryCompanyRecord,
  type TerritoryOverview,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/*
 * #2486 (16/09/2026) — le panneau territoire a quitté Découvrir. Depuis, aucun
 * écran web n'appelle `fetchTerritoryOverview`, `fetchTerritoryCoverage`,
 * `fetchTerritoryCommunes` ni `RADIUS_STEPS` : ils restent, parce que les
 * routes `territory/*` vivent toujours côté API (Laura lit
 * `territory/overview`). `fetchTerritoryCompany` garde son appelant
 * (`TerritoryCompanyPanel`, ouvert depuis « Contexte marché »). Les deux types
 * ci-dessous ne sont plus exportés : plus personne ne les importe.
 */

/** La forme de `GET territory/coverage`. */
interface TerritoryCoverage {
  total: number
  resolved: number
  byStatus: Record<string, number>
}

/** Les crans du rayon, partagés par tout sélecteur de zone (Territoire comme
 *  Découvrir). Le dernier EST la borne de l'API, pas un arrondi — mesuré le
 *  04/09/2026 : `radius=51` rend un 400 « entre 0.001 et 50 ». */
export const RADIUS_STEPS = [5, 10, 20, 30, TERRITORY_MAX_RADIUS_KM] as const

/** La maille demandée. Tout est optionnel sauf le département — qui reste le
 *  repli de toutes les autres, et la seule que les marchés publics savent lire. */
type TerritoryScopeInput = {
  department: string
  communeCode?: string
  communeName?: string
  latitude?: number
  longitude?: number
  radiusKm?: number
}

export async function fetchTerritoryOverview(
  scope: TerritoryScopeInput,
  sinceDays: number,
): Promise<TerritoryOverview> {
  return apiFetch<TerritoryOverview>({
    path: '/territory/overview',
    method: 'POST',
    // ⚠️ Les champs absents ne partent PAS. Envoyer `communeCode: undefined`
    // suffirait ici (JSON les omet), mais un `null` explicite serait refusé par
    // le schéma — la forme du corps est donc construite, pas devinée.
    body: {
      department: scope.department,
      sinceDays,
      ...(scope.communeCode ? { communeCode: scope.communeCode } : {}),
      ...(scope.communeName ? { communeName: scope.communeName } : {}),
      ...(scope.latitude !== undefined ? { latitude: scope.latitude } : {}),
      ...(scope.longitude !== undefined ? { longitude: scope.longitude } : {}),
      ...(scope.radiusKm !== undefined ? { radiusKm: scope.radiusKm } : {}),
    },
  })
}

/**
 * Les communes proposées par le champ « ville ».
 *
 * Une source muette rend une liste vide : le champ reste alors utilisable en
 * maille DÉPARTEMENT, qui ne dépend d'aucune source. On ne bloque pas l'écran
 * sur un découpage administratif indisponible.
 */
export async function fetchTerritoryCommunes(q: string): Promise<TerritoryCommune[]> {
  const response = await apiFetch<{ communes: TerritoryCommune[] }>({
    path: `/territory/communes?q=${encodeURIComponent(q)}`,
  })
  return response.communes ?? []
}

export async function fetchTerritoryCoverage(): Promise<TerritoryCoverage> {
  return apiFetch<TerritoryCoverage>({ path: '/territory/coverage' })
}

/**
 * La fiche de REGISTRE d'une entreprise — gratuite, sans crédit.
 *
 * `company: null` n'est pas une erreur : `reason` dit s'il s'agit d'un nom que
 * le registre ne connaît pas (`not_found`) ou d'une réponse illisible
 * (`unreadable`). Une panne réseau, elle, rejette — et l'écran distingue les
 * deux, parce qu'elles n'appellent pas le même geste.
 */
export async function fetchTerritoryCompany(
  name: string,
): Promise<{ company: TerritoryCompanyRecord | null; reason: string | null }> {
  return apiFetch<{ company: TerritoryCompanyRecord | null; reason: string | null }>({
    path: `/territory/company?name=${encodeURIComponent(name)}`,
  })
}
