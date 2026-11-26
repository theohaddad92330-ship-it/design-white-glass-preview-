/**
 * #2398.5 (épopée #2843, LAU-FINAL-112 MISSION/DELIVERY) — LA CASCADE T-45 / T-30 / T-15.
 *
 * `mission_ending` n'avait qu'un seuil unique (trente jours) : la même notification
 * à J-29 et à J-3, sans dire à quel moment de la préparation du renouvellement ou
 * du repositionnement on en est. Les trois paliers se NOMMENT, à un seul endroit
 * (GA-26) : l'exécuteur et le catalogue les lisent ici, personne ne les recopie.
 *
 * Une mission sans date de fin n'a AUCUN palier (`null`) — on ne devine pas une
 * échéance, et un palier inventé ferait relancer un client au hasard.
 */
export const MISSION_ENDING_STAGES_DAYS = [15, 30, 45] as const

type MissionEndingStage = 'T-15' | 'T-30' | 'T-45'

/** Le plus lointain des paliers : la fenêtre que l'exécuteur demande à l'ATS. */
export const MISSION_ENDING_WINDOW_DAYS = MISSION_ENDING_STAGES_DAYS[MISSION_ENDING_STAGES_DAYS.length - 1]

export function missionEndingStage(daysRemaining: number | null): MissionEndingStage | null {
  if (daysRemaining === null || daysRemaining < 0) return null
  for (const stage of MISSION_ENDING_STAGES_DAYS) {
    if (daysRemaining <= stage) return `T-${stage}`
  }
  return null
}
