import type {
  Activity,
  ActivityKind,
  ActivityScope,
  ActivitySyncResult,
  EngagementSummary,
  LogActivityInput,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

export type Timeline = { items: Activity[]; engagement: EngagementSummary }

/** Une clé par objet : une activité saisie sur un contact ne recharge pas la
 *  timeline d'un autre compte. */
export const activityKeys = {
  timeline: (scope: ActivityScope, id: string, kind?: ActivityKind) =>
    ['activities', scope, id, kind ?? 'all'] as const,
}

export const activitiesApi = {
  timeline(scope: ActivityScope, id: string, kind?: ActivityKind): Promise<Timeline> {
    const params = new URLSearchParams({ scope, id })
    if (kind) params.set('kind', kind)
    return apiFetch<Timeline>({ path: `/activities?${params.toString()}` })
  },
  log(input: LogActivityInput): Promise<Activity> {
    return apiFetch<Activity, LogActivityInput>({ path: '/activities', method: 'POST', body: input })
  },
  remove(id: string): Promise<void> {
    return apiFetch<void>({ path: `/activities/${id}`, method: 'DELETE' })
  },
  sync(windowDays?: number): Promise<ActivitySyncResult> {
    return apiFetch<ActivitySyncResult, { windowDays?: number }>({
      path: '/activities/sync',
      method: 'POST',
      body: windowDays === undefined ? {} : { windowDays },
    })
  },
}
