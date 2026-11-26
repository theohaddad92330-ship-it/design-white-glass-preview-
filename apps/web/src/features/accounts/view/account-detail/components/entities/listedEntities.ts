import { normaliseEntities, splitEntitiesByActionable, type VocabularyEntityTerm } from './entityData'
import type { GraphEntity } from './entityTypes'
import { normaliseClaudeSites } from '../sites/siteGeo'
import { siteCategory, type SiteCategory, type SiteViewMode } from '../sites/siteStyles'
import type { SiteRow } from '../sites/siteTypes'

/** Les régions que la liste des sites emploie réellement. */
export function siteRegions(sites: SiteRow[]): ReadonlySet<string> {
  const regions = new Set<string>()
  for (const site of sites) if (site.region) regions.add(site.region)
  return regions
}

/**
 * #4612.1 — le compteur annonce ce que la liste montre : le nombre d'entités de l'onglet par défaut (« actionnables »)
 * sous la catégorie de sites choisie — le MÊME calcul que la carte (`normaliseEntities` → filtre → partage). `null` =
 * aucune entité listée (jamais « 0 »). Les autres entités ont leur onglet et leur total (`entitiesCard.totalNote`).
 */
export function countListedEntities(
  entities: unknown,
  pappersSubsidiaries: unknown,
  rootName: string | null,
  vocabulary: readonly VocabularyEntityTerm[],
  sites: unknown,
  category: SiteViewMode,
): number | null {
  const flat = normaliseEntities(entities, pappersSubsidiaries, rootName, vocabulary)
  const { actionable } = splitEntitiesByActionable(filterEntitiesBySiteCategory(flat, sites, category))
  return actionable.length > 0 ? actionable.length : null
}

/**
 * Le filtre par catégorie de site — qui ne conclut RIEN de notre ignorance.
 *
 * Il écartait toute entité dont la région ne recoupait pas celle des sites de
 * la catégorie. Comme la région d'une entité est de la prose (voir
 * `buildEntityRows`), presque aucune ne recoupait : l'onglet « Sièges » rendait
 * « Aucune entité actionnable associée à cette catégorie de sites », c'est-à-dire
 * une affirmation, là où la vérité est « je ne sais pas les placer ».
 *
 * Une entité qu'on ne sait PAS placer est donc CONSERVÉE — sa colonne de droite
 * dira « non mesuré ». Seule une entité qu'on sait placer AILLEURS est écartée.
 */
export function filterEntitiesBySiteCategory(entities: GraphEntity[], sites: unknown, category: SiteViewMode) {
  if (category === 'all') return entities
  const placeable = siteRegions(normaliseClaudeSites(sites))
  const regions = matchingSiteRegions(sites, category)
  return entities.filter(entity => {
    if (entity.region == null || !placeable.has(entity.region)) return true
    return regions.has(entity.region)
  })
}

function matchingSiteRegions(sites: unknown, category: SiteCategory) {
  const regions = new Set<string>()
  normaliseClaudeSites(sites).forEach(site => {
    if (siteCategory(site) === category && site.region) regions.add(site.region)
  })
  return regions
}
