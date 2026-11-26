import { resolveRadarTechnology } from '@bellum/contracts'

/**
 * #4285.3 — la technologie que l'entrée « Radar par technologie » de Découvrir PRÉ-REMPLIT :
 * celle déjà tapée dans « Compétences », sinon dans le texte libre. Seule une technologie de la
 * liste SUIVIE (`RADAR_TECHNOLOGIES`) pré-remplit — un mot quelconque n'ouvre jamais un radar
 * libre à la place du commercial. `null` : l'entrée ouvre le radar vide, comme avant.
 */
export function radarTechnologyFromFilters(filters: {
  technologiesObserved?: string | string[]
  freetext?: string
}): string | null {
  const skills = Array.isArray(filters.technologiesObserved)
    ? filters.technologiesObserved.join(', ')
    : (filters.technologiesObserved ?? '')
  for (const text of [skills, filters.freetext ?? '']) {
    const ref = resolveRadarTechnology(text)
    if (ref?.kind === 'closed') return ref.label
  }
  return null
}
