import { memo, useState } from 'react'
import { BackgroundTasksPill } from './BackgroundTasksPill'
import { BackgroundTasksSheet } from './BackgroundTasksSheet'
import { useBackgroundEntries } from './useBackgroundEntries'
import { useHasRunningAnalysis } from './useHasRunningAnalysis'

/**
 * Pill+sheet pair surfaced in the sidebar BrandHeader. Only renders while at
 * least one task is tracked across both stores; everything else (entries
 * derivation, dismiss routing, presentation) lives in dedicated modules.
 */
export const BackgroundTasksIndicator = memo(function BackgroundTasksIndicator() {
  const [open, setOpen] = useState(false)
  const { entries, dismiss } = useBackgroundEntries()

  const hasRunningAnalysis = useHasRunningAnalysis(entries)

  if (!hasRunningAnalysis) return null

  return (
    <>
      <BackgroundTasksPill entries={entries} onClick={() => setOpen(true)} />
      <BackgroundTasksSheet open={open} onOpenChange={setOpen} entries={entries} dismiss={dismiss} />
    </>
  )
})
