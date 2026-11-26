import { personaFromUserRole, type PilotagePersona } from '@bellum/contracts'

/**
 * Les quatre blocs du Cockpit `/pilotage`, dans l'ordre PAR DÉFAUT (Louis
 * 14/10/2026) : ce qui a bougé → ce qu'il faut décider → suis-je dans les
 * clous (objectif) → où la chaîne décroche.
 */
export const COCKPIT_BLOCK_IDS = ['weekDelta', 'decisions', 'objective', 'chain'] as const
export type CockpitBlockId = (typeof COCKPIT_BLOCK_IDS)[number]

/**
 * Ce que chaque persona lit EN PREMIER. Le reste suit dans l'ordre par défaut.
 * Dirigeant (fondateur, directeur d'agence) : l'objectif. Manager commercial
 * (directeur de BU / commercial, business manager) : les décisions. Les autres n'ont
 * pas de tête propre — l'ordre par défaut.
 */
const COCKPIT_LEADS: Partial<Record<PilotagePersona, readonly CockpitBlockId[]>> = {
  fondateur: ['objective'],
  directeur_bu: ['decisions'],
  business_manager: ['decisions'],
}

/**
 * Même modèle que `orderBriefingBlocks` : le rôle RÉORDONNE, il ne filtre
 * jamais (`c76_role_reordonne_jamais_ne_filtre`) — le résultat est toujours
 * une permutation des quatre blocs.
 */
export function orderCockpitBlocks(userRole: string | null | undefined): readonly CockpitBlockId[] {
  const persona = personaFromUserRole(userRole)
  const leads = (persona ? COCKPIT_LEADS[persona] : undefined) ?? []
  return [...leads, ...COCKPIT_BLOCK_IDS.filter(id => !leads.includes(id))]
}
