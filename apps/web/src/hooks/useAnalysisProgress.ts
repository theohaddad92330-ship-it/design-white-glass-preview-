import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { subscribeToAnalysisRun } from '@/lib/analysis-subscription'
import { reconcileAnalysisStatus, type AnalysisStatusPayload } from '@/lib/analysis-status-sync'
import { analysisStatusKey, fetchAnalysisStatus } from '@/hooks/useAnalysisStatusSync'
import { useSession } from '@/lib/hooks/use-session'
import { useAnalysisRun, useAnalysisStore } from '@/stores/analysisStore'

/**
 * Live progress for an account whose status === 'analyzing'. Reads from the
 * shared Zustand store so the same run started in Search renders identically
 * here. Re-subscribes to the WS unconditionally — without that, navigating
 * from /search to /accounts/:id drops the live updates because Search's
 * subscription is torn down on unmount and the store-hit path used to skip
 * re-attaching.
 *
 * If the page was opened cold (the store is empty), we bootstrap from
 * ``GET /analysis/status/:accountId`` to populate jobId + phase + steps
 * before subscribing.
 */
export function useAnalysisProgress(accountId: string | null, accountStatus: string | undefined) {
  const { user } = useSession()
  const qc = useQueryClient()
  const run = useAnalysisRun(accountId)
  // #4411 — la relance part de la fiche mais l'analyse se suit sur /search : au
  // retour, le détail en cache est encore `completed` (ancienne analyse) alors que
  // le store porte déjà le run neuf. Le statut en cache n'est donc PAS la seule
  // preuve d'un run en vol — sans ce second témoin, aucun abonnement, et la fiche
  // ne bougeait qu'après F5.
  const runInFlight = run?.state === 'analyzing' || run?.state === 'starting'
  const shouldWatch = accountId !== null && (accountStatus === 'analyzing' || runInFlight)

  // Cold open (the store has no run for this account — another tab, another
  // device, or a reload that cleared it): ask the server where the run is. The
  // app-wide `useAnalysisStatusSync` takes over the polling once the run exists
  // in the store, so this query only has to get us to that point.
  const needsBootstrap = shouldWatch && !run
  const statusQuery = useQuery<AnalysisStatusPayload>({
    queryKey: accountId ? analysisStatusKey(accountId) : ['analysis', 'status', 'idle'],
    queryFn: () => fetchAnalysisStatus(accountId as string),
    enabled: needsBootstrap && !!user,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!shouldWatch || !accountId) return

    const store = useAnalysisStore.getState()

    if (!store.runs[accountId]) {
      const initial = statusQuery.data
      if (!initial?.jobId) return // wait for the status query to land
      if (initial.state === 'completed' || initial.state === 'failed' || initial.state === 'canceled') return
      // `adopt` — not `start`. We did not launch this run, so we must not
      // assert a position for it; the reconcile call below supplies the real
      // one (phase AND the completed-step checklist) from state.
      store.adopt(accountId, initial.jobId, '')
      reconcileAnalysisStatus(accountId, initial, qc)
    }

    // Always re-attach the WS subscription. The previous owner (e.g. Search)
    // tore its subscription down on unmount, so without this the user sees
    // stale phase/steps after navigation.
    return subscribeToAnalysisRun(accountId, qc)
  }, [shouldWatch, accountId, statusQuery.data, qc])

  if (!shouldWatch) return { phase: '', error: null, state: 'idle' as const, isWatching: false }

  return {
    // #3666 (Louis 13/10) — no figure leaves this hook: the server's heartbeat
    // milestone is not a measure. The card reads the measured STEP from the store.
    phase: run?.phase ?? '',
    error: run?.error ?? null,
    state: run?.state ?? 'analyzing',
    isWatching: true,
  }
}
