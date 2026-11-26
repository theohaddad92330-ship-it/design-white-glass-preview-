import type { OutreachPlaybookKey } from '@bellum/contracts'

/**
 * Théo C sequences-bibliotheque.N3 — les FAMILLES de la bibliothèque de modèles, dans l'ordre de Théo.
 *
 * Une famille est une lecture de la bibliothèque (le moment métier d'un modèle), jamais une donnée stockée :
 * aucune migration, aucun modèle déplacé. Une famille sans modèle ne fait aucune pastille.
 */
export const PLAYBOOK_FAMILY_ORDER = [
  'prospecting',
  'development',
  'meeting',
  'staffing',
  'mission_follow_up',
  'admin',
] as const
export type PlaybookFamily = (typeof PLAYBOOK_FAMILY_ORDER)[number]

const FAMILY_OF: Record<OutreachPlaybookKey, PlaybookFamily> = {
  hiring_signal: 'prospecting',
  new_cio: 'prospecting',
  tender: 'prospecting',
  warm_contact: 'prospecting',
  win_back: 'development',
  regie_to_forfait: 'development',
  after_meeting: 'meeting',
  bench_consultant: 'staffing',
}

export function familyOfPlaybook(key: OutreachPlaybookKey): PlaybookFamily {
  return FAMILY_OF[key]
}

/** Les familles qui ont au moins un modèle, dans l'ordre de Théo. */
export function familiesPresent(keys: readonly OutreachPlaybookKey[]): PlaybookFamily[] {
  const present = new Set(keys.map(familyOfPlaybook))
  return PLAYBOOK_FAMILY_ORDER.filter(family => present.has(family))
}
