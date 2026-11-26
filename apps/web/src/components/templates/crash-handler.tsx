import { memo, useState, type ReactNode } from 'react'
import { CrashContext } from '@/lib/hooks/use-crash'

/**
 * Bridges imperative code (effects, callbacks, async) to the React error boundary.
 * `useCrash()` pushes a reason here; this component re-throws on the next render
 * so the nearest `errorComponent` (RootErrorBoundary) can classify and display it.
 */
export const CrashHandler = memo(function CrashHandler({ children }: { children: ReactNode }) {
  const [crashReason, setCrashReason] = useState<Error | undefined>(undefined)

  if (crashReason) {
    throw crashReason
  }

  return <CrashContext.Provider value={setCrashReason}>{children}</CrashContext.Provider>
})
