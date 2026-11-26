import { useMemo } from 'react'
import type { DisplayTask } from './types'

export function hasRunningAnalysis(entries: DisplayTask[]): boolean {
  // The "analyse en cours" pill must light ONLY for an *analysis* — not for an
  // unrelated background task (e.g. a 200 ms profile auto-save), which would
  // otherwise pop the analysis indicator with no analysis behind it.
  //
  // #2729 — `running` ALONE used to gate this, which hid the indicator at the
  // exact moment an analysis died: `BackgroundTasksPill` already renders a
  // full "Échec" state (`AlertCircle`, red border, `tasks.status.error`), but
  // this gate never let it render, since a run that just failed is no longer
  // `running`. `error` joins the predicate so a stuck/failed analysis stays
  // announced — on EVERY screen the sidebar reaches, including `/chat` — until
  // the user dismisses it or launches another. A `completed` analysis still
  // does not (re)light the pill: nothing is wrong, nothing to surface.
  return entries.some(entry => entry.source === 'analysis' && (entry.status === 'running' || entry.status === 'error'))
}

export function useHasRunningAnalysis(entries: DisplayTask[]): boolean {
  return useMemo(() => hasRunningAnalysis(entries), [entries])
}
