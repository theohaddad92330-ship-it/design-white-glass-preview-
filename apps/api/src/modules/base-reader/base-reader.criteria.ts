import type { BaseReaderCriteria, BaseReaderFamily } from '@bellum/contracts'
import { clampBaseReaderLimit, clampBaseReaderOffset } from './base-reader.limits'

/** Ce qu'un appelant a pu poser — tout est optionnel, et une absence n'est pas une valeur. */
type BaseReaderAsked = {
  terms?: string[]
  city?: string
  departments?: string[]
  regions?: string[]
  from?: string
  to?: string
  families?: BaseReaderFamily[]
  accountIds?: string[]
  excludeEsn?: boolean
  limit?: number
  offset?: number
}

/**
 * #4792 — les critères, normalisés UNE fois, au bord.
 *
 * Un champ absent devient son NEUTRE (liste vide, `null`) : le service distingue alors « aucun
 * critère » de « critère qui ne correspond à rien », et les deux ne rendent pas la même chose. Les
 * deux plafonds sont appliqués ici, à l'entrée, pour que le service ne les re-applique pas à sa façon.
 *
 * Fonction PURE, hors du contrôleur : c'est ce qui la rend mesurable sans instancier NestJS.
 */
export function baseReaderCriteriaOf(asked: BaseReaderAsked): BaseReaderCriteria {
  return {
    terms: asked.terms ?? [],
    city: asked.city ?? null,
    departments: asked.departments ?? [],
    regions: asked.regions ?? [],
    from: asked.from ?? null,
    to: asked.to ?? null,
    families: asked.families ?? [],
    accountIds: asked.accountIds ?? [],
    ...(asked.excludeEsn ? { excludeEsn: true } : {}),
    limit: clampBaseReaderLimit(asked.limit),
    offset: clampBaseReaderOffset(asked.offset),
  }
}
