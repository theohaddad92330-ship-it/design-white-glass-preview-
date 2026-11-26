import type { MissionAmendmentEventType, MissionMarginScenarioKind } from '@bellum/contracts'

/**
 * #2783 — épopée « simulation impact avenant (revenu/marge/forecast) »
 * (#2423.6). Constat du tri : `mission-amendment.service.ts`/`.controller.ts`
 * n'appellent aucune simulation ; `simulateMissionMarginScenario` (#2420.14)
 * existe côté serveur mais n'était branché à AUCUN chemin de l'avenant.
 *
 * Cette fonction est l'UNIQUE endroit qui décide quel scénario du simulateur
 * EXISTANT (`MarginScenarioSimulator`, `MissionMarginEngine.tsx`) pré-remplir
 * dans l'écran d'avenant — jamais un second moteur de calcul (GA-26). Portée
 * de l'épopée : TJM, durée, dates — jamais forecast/facturation/PO (`hors
 * lot` au triage). Les treize autres types d'événement (société, site, pause,
 * remplacement de consultant, périmètre…) rendent `null` : un avenant qui n'a
 * ni TJM ni date ne se force pas sur un scénario qui ne veut rien dire — « on
 * n'affiche pas ce qu'on n'a pas ».
 */
export function amendmentSimulationScenarioKind(
  eventType: MissionAmendmentEventType,
): Extract<MissionMarginScenarioKind, 'renewed_rate' | 'extension'> | null {
  switch (eventType) {
    case 'daily_rate_change':
      return 'renewed_rate'
    case 'end_date_change':
    case 'start_date_change':
      return 'extension'
    default:
      return null
  }
}
