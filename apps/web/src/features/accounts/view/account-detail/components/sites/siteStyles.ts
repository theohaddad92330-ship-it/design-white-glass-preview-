import { i18n } from '@/i18n'
import { countSites } from './siteGeo'
import type { RegionStat, SiteRow, SiteTypeStat } from './siteTypes'

export type SiteCategory = 'headquarters' | 'office' | 'establishment' | 'industrial'
export type SiteViewMode = 'all' | SiteCategory

// Libellés résolus côté composant via t(`categories.${key}`) (ns accountSites).
//
// UNE SEULE TEINTE, l'intensité pour le rang — tome 7 §26.1, garde GA-64 :
// « une couleur porte un état, jamais une catégorie », et sa réponse littérale
// « il utilise une seule teinte, avec l'intensité pour la valeur ».
//
// Les quatre catégories portaient les QUATRE jetons sémantiques : le siège en
// primaire, un bureau en `--bellum-info` (« ce qui est déduit »), un
// établissement en `--bellum-warning` (« ce qui demande une décision »), un
// site industriel en `--bellum-success` (« ce qui est fait, validé »). Aucun
// des trois derniers n'était vrai, et l'ambre dépensé sur une carte de sites
// ne voulait plus rien dire quand un vrai avertissement arrivait à l'écran.
//
// L'intensité dit maintenant quelque chose de VRAI et qui se lit sans
// légende : le siège est le point d'ancrage, un site industriel est le plus
// périphérique. Le NOM de chaque catégorie reste écrit à côté de sa pastille,
// dans la légende de la carte comme dans la carte de répartition — c'est lui
// qui portait l'information, la couleur ne faisait que la répéter mal.
export const SITE_CATEGORY_STYLES: Record<SiteCategory, { dot: string; marker: string }> = {
  headquarters: { dot: 'bg-[var(--bellum-primary-500)]', marker: 'fill-[var(--bellum-primary-500)]' },
  office: { dot: 'bg-[var(--bellum-primary-400)]', marker: 'fill-[var(--bellum-primary-400)]' },
  establishment: { dot: 'bg-[var(--bellum-primary-300)]', marker: 'fill-[var(--bellum-primary-300)]' },
  industrial: { dot: 'bg-[var(--bellum-primary-200)]', marker: 'fill-[var(--bellum-primary-200)]' },
}

const PRIORITY_STYLES: Record<string, { pill: string; labelKey: string }> = {
  haute: {
    pill: 'bg-[var(--bellum-primary-50)] text-[var(--bellum-primary-700)] dark:bg-[var(--bellum-primary-600)] dark:text-[var(--bellum-primary-100)] ',
    labelKey: 'accountSites:priority.haute',
  },
  moyenne: {
    pill: 'bg-[color-mix(in_srgb,var(--bellum-info)_10%,transparent)] text-[var(--bellum-info)] ',
    labelKey: 'accountSites:priority.moyenne',
  },
  basse: {
    pill: 'bg-[color-mix(in_srgb,var(--bellum-border)_70%,transparent)] text-[var(--bellum-text-secondary)] ',
    labelKey: 'accountSites:priority.basse',
  },
}

export function priorityStyle(priority: string | null | undefined) {
  const normalized = priority?.toLowerCase()
  if (normalized === 'high') return PRIORITY_STYLES.haute!
  if (normalized === 'medium') return PRIORITY_STYLES.moyenne!
  if (normalized === 'low') return PRIORITY_STYLES.basse!
  return normalized ? (PRIORITY_STYLES[normalized] ?? PRIORITY_STYLES.moyenne!) : PRIORITY_STYLES.moyenne!
}

export function siteCategory(row: SiteRow): SiteCategory {
  const type = row.type?.toLowerCase() ?? ''
  if (row.is_headquarters || type.includes('siège') || type.includes('siege')) return 'headquarters'
  if (type.includes('bureau')) return 'office'
  if (
    type.includes('industri') ||
    type.includes('logistique') ||
    type.includes('entrepôt') ||
    type.includes('entrepot')
  )
    return 'industrial'
  return 'establishment'
}

export function buildRegionStats(rows: SiteRow[]): RegionStat[] {
  const counts = new Map<string, number>()
  const unknownRegion = i18n.t('accountSites:regions.unknown')
  // #4326 — pondérée par les établissements regroupés dans la ville.
  rows.forEach(row =>
    counts.set(row.region ?? unknownRegion, (counts.get(row.region ?? unknownRegion) ?? 0) + (row.establishments ?? 1)),
  )
  const total = Math.max(1, countSites(rows))
  const sorted = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count, percent: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count)
  if (sorted.length <= REGION_STAT_LIMIT) return sorted
  // #4326 — jamais de troncature silencieuse : les régions au-delà de la limite
  // d'affichage se regroupent sous une ligne qui le DIT.
  const head = sorted.slice(0, REGION_STAT_LIMIT - 1)
  const rest = sorted.slice(REGION_STAT_LIMIT - 1)
  const restCount = rest.reduce((sum, stat) => sum + stat.count, 0)
  return [
    ...head,
    {
      name: i18n.t('accountSites:regions.others', { count: rest.length }),
      count: restCount,
      percent: Math.round((restCount / total) * 100),
    },
  ]
}

const REGION_STAT_LIMIT = 6

const SITE_CATEGORY_ORDER: readonly SiteCategory[] = ['headquarters', 'office', 'establishment', 'industrial']

export function buildTypeStats(rows: SiteRow[]): SiteTypeStat[] {
  const byCategory = new Map<SiteCategory, number>()
  rows.forEach(row => byCategory.set(siteCategory(row), (byCategory.get(siteCategory(row)) ?? 0) + 1))
  return SITE_CATEGORY_ORDER.map(category => ({
    label: i18n.t(`accountSites:categories.${category}`),
    count: byCategory.get(category) ?? 0,
    category,
  })).filter(stat => stat.count > 0)
}

/** La pastille d'une ligne de répartition — la MÊME rampe que la carte, lue
 *  au même endroit (`SITE_CATEGORY_STYLES`). Elle en avait une seconde, qui
 *  divergeait déjà : « industriel » y était vert comme « établissement ». */
export function siteCategoryDotClass(category: SiteCategory) {
  return SITE_CATEGORY_STYLES[category].dot
}
