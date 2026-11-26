import type { DailyBriefing } from '@bellum/contracts'

/**
 * Les tuiles de synthèse de « Aujourd'hui » (refonte Théo, 23/10/2026) : ce qui
 * attend, en une rangée, AVANT la file. Chaque tuile COMPTE du réel et mène à la
 * rangée qui le porte (`target` = ancre de section, jamais un bouton mort).
 *
 * Une absence ne fait AUCUNE tuile : un compte à zéro n'est pas une mesure
 * (GA-18 / GA-19), et la messagerie muette ne dit pas « 0 réponse » — elle ne
 * dit rien.
 */
type TodayTileId = 'queue' | 'drafts' | 'missions' | 'replies' | 'signals'

export type TodayTile = { id: TodayTileId; count: number; target: string }

/** Les ancres posées sur les sections de `BriefingPage`. */
export const TODAY_ANCHORS = { queue: 'today-queue', replies: 'today-mail', signals: 'today-signals' } as const

const MISSION_KINDS: ReadonlySet<string> = new Set(['mission_end', 'mission_no_end_date'])

export function buildTodayTiles(data: DailyBriefing): TodayTile[] {
  const drafts = (data.actions ?? []).reduce(
    (total, action) =>
      total + (action.preparedArtifacts ?? []).filter(artifact => artifact.kind === 'draft_message').length,
    0,
  )
  const replies =
    data.mail?.state === 'ready' ? (data.mail.positiveReplies?.length ?? 0) + (data.mail.unread?.length ?? 0) : 0
  // Refonte Théo — « Missions à anticiper » : les fins de mission et les missions sans date
  // de fin que la file porte déjà (mêmes cartes, jamais une seconde lecture des missions).
  const missions = (data.actions ?? []).filter(action => MISSION_KINDS.has(action.kind)).length
  const tiles: TodayTile[] = [
    { id: 'queue', count: data.actions?.length ?? 0, target: TODAY_ANCHORS.queue },
    { id: 'drafts', count: drafts, target: TODAY_ANCHORS.queue },
    { id: 'missions', count: missions, target: TODAY_ANCHORS.queue },
    { id: 'replies', count: replies, target: TODAY_ANCHORS.replies },
    { id: 'signals', count: data.discoverAlerts?.length ?? 0, target: TODAY_ANCHORS.signals },
  ]
  return tiles.filter(tile => tile.count > 0)
}
