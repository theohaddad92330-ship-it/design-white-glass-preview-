import { useEffect, useMemo, useState } from 'react'
import { i18n } from '@/i18n'
import { analysisStepLabel } from '@/lib/analysis-step-progress'
import { isRunStale, useAnalysisStore } from '@/stores/analysisStore'
import { useBackgroundTasksStore } from '@/stores/backgroundTasksStore'
import { MIN_RUNNING_MS, statusLabel, type DismissFn, type DisplayTask, type Status } from './types'

/**
 * Aggregates entries from `analysisStore` + `backgroundTasksStore` into a
 * unified, sorted list. Applies the `MIN_RUNNING_MS` grace window so very
 * short tasks remain visually "running" long enough to be perceived, and
 * exposes a single `dismiss` callback that routes back to the right store.
 */
export function useBackgroundEntries(): {
  entries: DisplayTask[]
  dismiss: DismissFn
} {
  const runs = useAnalysisStore(s => s.runs)
  const tasks = useBackgroundTasksStore(s => s.tasks)
  const clearRun = useAnalysisStore(s => s.clear)
  const clearTask = useBackgroundTasksStore(s => s.clear)
  const pruneStale = useAnalysisStore(s => s.pruneStale)

  // Evict dead orphan runs once on mount: a run whose terminal Socket.IO event
  // reached nobody (tab closed / navigated away / worker redeployed) would
  // otherwise stay `analyzing` in localStorage forever and surface as a live,
  // clickable analysis routing to a stale account. Purely a persisted-state GC —
  // a genuinely fresh run (recent events) is left untouched.
  useEffect(() => {
    pruneStale()
  }, [pruneStale])

  const rawEntries = useMemo<DisplayTask[]>(() => {
    const now = Date.now()
    return [
      // Belt-and-suspenders against the mount-time prune: filter any run that is
      // stale RIGHT NOW so the pill never lights and no card can route to a
      // stale account, even if a run crossed the staleness ceiling after mount.
      ...Object.values(runs)
        .filter(run => !isRunStale(run, now))
        .map<DisplayTask>(run => {
          const status: Status = run.state === 'completed' ? 'completed' : run.state === 'error' ? 'error' : 'running'
          const lastEvent = run.events[run.events.length - 1]
          const subtitle = status === 'error' ? (run.error ?? statusLabel('error')) : (lastEvent?.label ?? run.phase)
          const title = run.companyName || i18n.t('analysis:tasks.analysisLabel')
          return {
            key: `analysis:${run.accountId ?? run.jobId ?? run.companyName}`,
            title,
            label: i18n.t('analysis:tasks.analysisLabel'),
            loaderVariant: 'grid-orbit',
            subtitle,
            status,
            // #3666 — l'étape mesurée, ou rien (jamais une barre vide qui se lit « bloquée »).
            stepLabel: analysisStepLabel(run.currentStep) ?? undefined,
            accountId: run.accountId ?? undefined,
            sourceId: run.accountId ?? run.jobId ?? run.companyName,
            source: 'analysis',
            startedAt: run.events[0]?.at ?? Date.now(),
          }
        }),
      ...Object.values(tasks).map<DisplayTask>(t => ({
        key: `task:${t.id}`,
        title: t.title,
        label: t.label ?? t.title,
        loaderVariant: t.loaderVariant ?? 'grid-orbit',
        subtitle: t.state === 'error' ? (t.error ?? t.subtitle ?? statusLabel('error')) : t.subtitle,
        status: t.state,
        sourceId: t.id,
        source: 'task',
        startedAt: t.startedAt,
      })),
    ]
  }, [runs, tasks])

  // Tick to re-evaluate the grace window after MIN_RUNNING_MS expires for any
  // task that finished too quickly. Without this, a 200 ms save would flip the
  // indicator off the same frame it appears.
  const [, forceTick] = useState(0)
  useEffect(() => {
    const now = Date.now()
    const timers: ReturnType<typeof setTimeout>[] = []
    for (const e of rawEntries) {
      if (e.status !== 'running') {
        const remaining = e.startedAt + MIN_RUNNING_MS - now
        if (remaining > 0) {
          timers.push(setTimeout(() => forceTick(n => n + 1), remaining))
        }
      }
    }
    return () => {
      for (const t of timers) clearTimeout(t)
    }
  }, [rawEntries])

  const entries: DisplayTask[] = useMemo(() => {
    const now = Date.now()
    return rawEntries
      .map(e =>
        e.status !== 'running' && now - e.startedAt < MIN_RUNNING_MS ? { ...e, status: 'running' as const } : e,
      )
      .sort((a, b) => {
        const aRunning = a.status === 'running'
        const bRunning = b.status === 'running'
        if (aRunning !== bRunning) return aRunning ? -1 : 1
        return b.startedAt - a.startedAt
      })
  }, [rawEntries])

  const dismiss: DismissFn = entry => {
    if (entry.source === 'analysis') clearRun(entry.sourceId)
    else clearTask(entry.sourceId)
  }

  return { entries, dismiss }
}
