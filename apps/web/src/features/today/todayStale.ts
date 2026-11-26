import { STALE_ACTION_DAYS } from '@bellum/contracts'
import type { TodayItem } from './todayQueue'

const DAY_MS = 86_400_000

/** Le jour calendaire (UTC) d'une échéance `YYYY-MM-DD…`, ou `null` si elle ne se lit pas. */
function dayOf(dueAt: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueAt)
  if (!match) return null
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS
}

/**
 * #4485 — les relances du plan EN RETARD DE PLUS DE 30 JOURS, que le bandeau propose de clore.
 *
 * Uniquement `plan_item` (la seule maison dont on peut déclarer le « fait » en lot), datées (une relance sans
 * échéance n'est jamais « en retard »), et persistées (une étape virtuelle `plan:…` n'a pas de ligne à clore).
 * Une absence ne fait aucune ligne : pas de bandeau quand la liste est vide.
 */
export function staleActionIds(items: readonly TodayItem[], now: Date): string[] {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS
  return items
    .filter(item => {
      if (item.kind !== 'plan_item' || !item.dueAt || item.nativeId.startsWith('plan:')) return false
      const due = dayOf(item.dueAt)
      return due !== null && today - due > STALE_ACTION_DAYS
    })
    .map(item => item.nativeId)
}
