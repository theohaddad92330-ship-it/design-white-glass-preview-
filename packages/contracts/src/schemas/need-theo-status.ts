import { needBoardStatus, normaliseNeedStatus } from './need-status.js'
import { PROJECT_NEED_STATUSES, type ProjectNeedStatus } from './project.js'

/**
 * Les TROIS statuts de besoin affichés (Théo V22, tranché par Louis le 22/10 —
 * Q10) : À qualifier · Ouvert · Couvert. Les autres états STOCKÉS restent en
 * base, intacts, et voyagent en ÉTIQUETTES ({@link needStatusTag}).
 *
 * ⚠️ Correspondance écrite (rien n'est réécrit en base — on archive, on ne
 * supprime pas ; la contrainte SQL et les écritures ne bougent pas) :
 *
 *  · À qualifier ← `detected`, `to_qualify`, ancien `open`
 *  · Ouvert      ← `qualified`, `to_match`, `matching`, `shortlist_ready`,
 *                  `submitted`, `client_review`, `interview`, `negotiation`,
 *                  `on_hold`, `to_reactivate`
 *  · Couvert     ← `won`, `staffed`
 *  · (clos)      ← `lost`, `cancelled` : ni couverts ni ouverts. Ils ne sont
 *                  PAS un quatrième statut de l'écran ; ils ne s'affichent que
 *                  sur filtre, avec leur étiquette. Les ranger « Couvert »
 *                  mentirait sur un besoin que le client a abandonné.
 */
export const NEED_THEO_STATUSES = ['to_qualify', 'open', 'covered'] as const
export type NeedTheoStatus = (typeof NEED_THEO_STATUSES)[number]

export function needTheoStatus(status: string | null | undefined): NeedTheoStatus | 'closed' {
  const stored = normaliseNeedStatus(status)
  if (stored === 'lost' || stored === 'cancelled') return 'closed'
  if (stored === 'won') return 'covered'
  if (stored === 'detected' || stored === 'to_qualify') return 'to_qualify'
  return 'open'
}

/** L'état stocké précis, quand le statut affiché ne le dit pas déjà ; `null` sinon. */
export function needStatusTag(status: ProjectNeedStatus): ProjectNeedStatus | null {
  const shown = needBoardStatus(status)
  const stored = normaliseNeedStatus(shown)
  if (stored === 'to_qualify' || stored === 'won') return null
  if (shown === 'open') return null
  return shown
}

/** La correspondance inverse : les états STOCKÉS que recouvre un statut affiché. */
export function needStoredStatusesFor(theo: NeedTheoStatus): readonly ProjectNeedStatus[] {
  return PROJECT_NEED_STATUSES.filter(stored => needTheoStatus(stored) === theo)
}
