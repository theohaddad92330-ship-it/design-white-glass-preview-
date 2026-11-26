import type { DiscoverCandidate } from './discover-types'
import type { UnifiedFilters } from './discover-filters'

/**
 * #2165.11 — DÉCISION Louis 17/09 midi (QCM Découvrir) : « au-delà d'un
 * seuil de résultats ou si plusieurs secteurs/zones se mêlent, Laura propose
 * 2 à 3 sous-recherches NOMMÉES ; seuil à un seul endroit. »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE « SE MÊLER » VEUT DIRE ICI
 * ─────────────────────────────────────────────────────────────────────────
 * `sectors` est un contrôle MULTI-sélection du rail (`UnifiedFilters.sectors:
 * string[]`) : « plusieurs secteurs se mêlent » se lit donc directement sur
 * le FILTRE, sans rien observer. ⚠️ RENVERSEMENT ASSUMÉ et daté du 08/10
 * (#3876, recette prod) : deux secteurs cochés ensemble ne suffisent plus
 * seuls — un volume réel de résultats doit s'y ajouter, SAUF au-delà de
 * `MIXED_SECTORS_COUNT_THRESHOLD` secteurs, qui déclenche sans condition de
 * volume (voir plus bas).
 *
 * `department` est un champ MONO-valeur (texte libre, un seul département
 * réellement HONORÉ par le mode mono-secteur du split) ; `region` est
 * MULTI-valeur depuis #2642.1 (le rail coche IDF + Occitanie ensemble), mais
 * reste ici un signal de zone déjà choisie au même titre que `department` :
 * dès qu'UNE région est cochée, la zone n'est plus « à mêler ». « Plusieurs
 * zones se mêlent » ne peut donc se lire que dans les RÉSULTATS (aucune zone
 * choisie, mais les candidats couvrent plusieurs départements) — et
 * seulement combiné au volume : deux candidats dans deux départements
 * différents ne sont pas une recherche trop large, ils sont deux candidats.
 *
 * Secteur avant zone quand les deux se mêlent à la fois : un secteur coché
 * est un choix EXPLICITE de l'utilisateur, une zone dispersée n'est qu'une
 * observation sur ce qui est revenu.
 *
 * Aucune dimension à nommer (une seule zone observée, un seul secteur coché,
 * volume élevé mais homogène) ⇒ `null`. Même doctrine que les presets
 * sourcés (#2165.12/.13) : on ne fabrique pas une coupure arbitraire, on dit
 * qu'il n'y a rien à distinguer.
 */
export const DISCOVER_SPLIT_RESULT_THRESHOLD = 200

/**
 * #3876 (VU EN PASSANT, lot V09 08/10) — RENVERSEMENT ASSUMÉ et daté de la
 * décision du 17/09 ci-dessus : « diviser cette recherche » se proposait dès
 * DEUX secteurs cochés, quel que soit le volume. Recette prod 08/10 : seuil
 * jugé trop bas — quelques secteurs cochés ensemble sont un choix de
 * comparaison ordinaire, pas une recherche à diviser. Au-delà de ce nombre de
 * secteurs, OU un volume réel de résultats (`DISCOVER_SPLIT_RESULT_THRESHOLD`,
 * même seuil que `mixed_zones`), justifient seuls la coupure.
 */
const MIXED_SECTORS_COUNT_THRESHOLD = 5

/** Au plus 3 sous-recherches nommées — jamais une liste qui remplace le rail. */
const MAX_SUB_SEARCHES = 3

type DiscoverSplitReason = 'mixed_sectors' | 'mixed_zones'

export interface DiscoverSubSearch {
  /** Un CODE secteur (résolu en libellé côté écran, `applicationSectorLabel`)
   *  pour `mixed_sectors`, un département BRUT (déjà un libellé lisible,
   *  `candidate.department`) pour `mixed_zones`. */
  value: string
  patch: Partial<UnifiedFilters>
}

export interface DiscoverSplitSuggestion {
  reason: DiscoverSplitReason
  subSearches: readonly DiscoverSubSearch[]
}

/** Les valeurs non vides, comptées par fréquence, triées décroissant. */
function topValues(values: readonly (string | null | undefined)[], max: number): string[] {
  const counts = new Map<string, number>()
  for (const raw of values) {
    const value = raw?.trim()
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([value]) => value)
}

export function suggestDiscoverSplit(
  candidates: readonly DiscoverCandidate[],
  filters: UnifiedFilters,
): DiscoverSplitSuggestion | null {
  // Priorité 1 — plusieurs secteurs COCHÉS ENSEMBLE : au-delà du seuil de
  // nombre, ou en dessous mais avec un volume réel de résultats (#3876).
  const manySectorsChosen = filters.sectors.length > MIXED_SECTORS_COUNT_THRESHOLD
  const fewSectorsWithRealVolume = filters.sectors.length > 1 && candidates.length > DISCOVER_SPLIT_RESULT_THRESHOLD
  if (manySectorsChosen || fewSectorsWithRealVolume) {
    const codes = filters.sectors.slice(0, MAX_SUB_SEARCHES)
    return {
      reason: 'mixed_sectors',
      subSearches: codes.map(code => ({ value: code, patch: { sectors: [code] } })),
    }
  }

  // Priorité 2 — aucune zone choisie, trop de résultats, ET ils couvrent
  // plusieurs départements : la recherche est trop large géographiquement.
  const noZoneChosen = !filters.department.trim() && filters.region.length === 0
  if (noZoneChosen && candidates.length > DISCOVER_SPLIT_RESULT_THRESHOLD) {
    const departments = topValues(
      candidates.map(c => c.department),
      MAX_SUB_SEARCHES,
    )
    if (departments.length >= 2) {
      return {
        reason: 'mixed_zones',
        subSearches: departments.map(department => ({ value: department, patch: { department } })),
      }
    }
  }

  return null
}
