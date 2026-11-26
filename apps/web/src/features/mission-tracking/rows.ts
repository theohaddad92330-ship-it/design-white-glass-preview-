import { useMemo } from 'react'
import {
  useCollectionsWindow,
  useInvoiceReadiness,
  useMissions,
  useTimesheetMonth,
  type MissionView,
} from '@/features/missions/api'
import {
  COLLECTIONS_WINDOW_MONTHS,
  collectionMonths,
  isCollectible,
  summarizeCollections,
} from '@/features/missions/collections'
import { isFinishedMission } from '@/features/missions/mission-status'
import { buildRecentActivity, type RecentActivityEvent } from './activity'
import { buildMissionTrackingRows, type MissionTrackingRow } from './derive'

/**
 * TOUT ce que l'écran affiche, composé à partir des hooks EXISTANTS de
 * `@/features/missions/api` — aucune nouvelle requête serveur, aucune
 * dérivation refaite (GA-26). C'est la réponse technique à l'objection de
 * D-22-2 : la seule chose neuve ici est le JOIN en mémoire, `buildMission
 * TrackingRows`, testé à part dans `derive.test.ts`.
 */
export function useMissionTrackingData(now: Date = new Date()) {
  const missions = useMissions()
  const timesheets = useTimesheetMonth()
  const readiness = useInvoiceReadiness()

  const months = useMemo(() => collectionMonths(now), [now])
  const collectionsWindow = useCollectionsWindow(months)

  const activeMissions = useMemo(
    () => (missions.data?.missions ?? []).filter(mission => !isFinishedMission(mission.status)),
    [missions.data?.missions],
  )

  const rows: MissionTrackingRow<MissionView>[] = useMemo(
    () => buildMissionTrackingRows(activeMissions, timesheets.data?.items ?? [], readiness.data?.items ?? [], now),
    [activeMissions, timesheets.data?.items, readiness.data?.items, now],
  )

  const collectionsRows = useMemo(() => collectionsWindow.items.filter(isCollectible), [collectionsWindow.items])
  const collectionsSummary = useMemo(() => summarizeCollections(collectionsRows, now), [collectionsRows, now])

  const recentActivity: RecentActivityEvent[] = useMemo(
    () => buildRecentActivity(timesheets.data?.items ?? [], collectionsWindow.items, 5),
    [timesheets.data?.items, collectionsWindow.items],
  )

  const isLoading = missions.isLoading || timesheets.isLoading || readiness.isLoading
  const isError = missions.isError || timesheets.isError || readiness.isError

  return {
    isLoading,
    isError,
    rows,
    activeMissionsCount: activeMissions.length,
    craSummary: timesheets.data?.summary,
    readinessSummary: readiness.data?.summary,
    readinessCanReadFinance: readiness.data?.canReadFinance === true,
    collectionsWindowMonths: COLLECTIONS_WINDOW_MONTHS,
    collectionsSummary,
    collectionsCanReadFinance: collectionsWindow.canReadFinance,
    collectionsFailedMonths: collectionsWindow.failedMonths,
    collectionsLoading: collectionsWindow.isLoading,
    recentActivity,
  }
}
