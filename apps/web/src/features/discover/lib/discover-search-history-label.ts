import { discoverPresets } from './discover-presets'
import { skillsText, type UnifiedFilters } from './discover-filters'

/** Les mots d'un libellé d'historique : fournis par l'écran (i18n, secteurs), jamais devinés ici. */
interface HistoryLabelNames {
  preset: (id: string) => string
  headcount: (range: string) => string
  sector: (code: string) => string
}

const MAX_PARTS = 3

/** Un préréglage est reconnu quand TOUT ce qu'il pose l'est : la moitié d'un préréglage n'en est pas un. */
function matchingPreset(filters: UnifiedFilters) {
  return discoverPresets().find(preset => {
    const entries = Object.entries(preset.patch)
    return (
      entries.length > 0 &&
      entries.every(([key, value]) => JSON.stringify(filters[key as keyof UnifiedFilters]) === JSON.stringify(value))
    )
  })
}

/**
 * #4313 — le libellé d'une recherche récente, dérivé de ses critères : le nom du préréglage s'il y
 * en a un, puis les premiers critères posés (ville ou département, secteur, effectif…), trois au
 * plus. Chaîne vide quand AUCUN critère n'est posé : l'écran dit alors « sans libellé ».
 */
export function searchHistoryLabel(filters: UnifiedFilters, names: HistoryLabelNames): string {
  const preset = matchingPreset(filters)
  const presetName = preset ? names.preset(preset.id) : ''
  const consumed = presetName && preset ? preset.patch : {}
  const parts = [
    presetName,
    skillsText(filters),
    filters.city.trim() || filters.department.trim(),
    ...filters.sectors.map(names.sector),
    ...('headcount' in consumed ? [] : filters.headcount.map(names.headcount)),
  ].filter(Boolean)
  return parts.slice(0, MAX_PARTS).join(' · ')
}
