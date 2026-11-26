import type { AnalysisContextPreset, AnalysisObjective } from '@bellum/contracts'

/**
 * Théo B r1-recherche.R4/N1 — les objectifs d'une analyse : QUATRE en vue, le reste sous « Autres objectifs »,
 * au choix MULTIPLE (« Plusieurs choix possibles »). La table des clés vit au contrat (`ANALYSIS_OBJECTIVES`) ;
 * ici, seulement leur rangement à l'écran et leur pont vers le preset de contexte (`AnalysisContextPreset`), qui reste
 * la forme structurée du contexte d'analyse et ne porte qu'UN objectif — celui du dernier clic.
 *
 * « Comprendre le groupe » remplace « Comprendre les filiales », « Situer les partenaires et concurrents » remplace
 * « Analyser la concurrence » ; « Approfondir une analyse » (`retry`) n'a plus de bouton : un lien profond qui porte
 * ce preset arrive sur « Un autre objectif », rien n'est inventé à sa place.
 */
export const MAIN_OBJECTIVES: readonly AnalysisObjective[] = [
  'open_account',
  'prepare_meeting',
  'find_decision_makers',
  'understand_group',
]
export const OTHER_OBJECTIVES: readonly AnalysisObjective[] = [
  'verify_signal',
  'prepare_listing',
  'map_partners_competitors',
  'other',
]

const PRESET_BY_OBJECTIVE: Record<AnalysisObjective, AnalysisContextPreset> = {
  open_account: 'strategic',
  prepare_meeting: 'known-account',
  find_decision_makers: 'strategic',
  understand_group: 'known-account',
  verify_signal: 'signal',
  prepare_listing: 'push-offer',
  map_partners_competitors: 'incumbent',
  other: 'free',
}

/** Le preset du DERNIER objectif choisi ; aucun objectif ⇒ contexte libre. */
export function presetForObjectives(objectives: readonly AnalysisObjective[]): AnalysisContextPreset {
  const last = objectives[objectives.length - 1]
  return last ? PRESET_BY_OBJECTIVE[last] : 'free'
}

/** L'objectif allumé à l'arrivée : le PREMIER qui porte ce preset, jamais tous ceux qui le partagent (#4086). */
export function initialObjectives(preset: AnalysisContextPreset): AnalysisObjective[] {
  if (preset === 'retry') return ['other']
  const first = (Object.keys(PRESET_BY_OBJECTIVE) as AnalysisObjective[]).find(
    key => PRESET_BY_OBJECTIVE[key] === preset,
  )
  return first ? [first] : ['other']
}

export function toggleObjective(current: readonly AnalysisObjective[], key: AnalysisObjective): AnalysisObjective[] {
  return current.includes(key) ? current.filter(k => k !== key) : [...current, key]
}
