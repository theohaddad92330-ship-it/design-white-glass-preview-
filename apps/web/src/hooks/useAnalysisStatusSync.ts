import { useEffect } from 'react'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { analysisPollMs, reconcileAnalysisStatus, type AnalysisStatusPayload } from '@/lib/analysis-status-sync'
import { isFallbackArmed } from '@/lib/api-origin'
import { onSocketConnect } from '@/lib/socket'
import { useSession } from '@/lib/hooks/use-session'
import { useAnalysisStore } from '@/stores/analysisStore'

export const analysisStatusKey = (accountId: string) => ['analysis', 'status', accountId] as const

export function fetchAnalysisStatus(accountId: string): Promise<AnalysisStatusPayload> {
  return apiFetch<AnalysisStatusPayload>({ path: `/analysis/status/${accountId}` })
}

/**
 * Keeps every in-flight run in the analysis store reconciled with the server.
 *
 * Mounted **once**, app-wide. That placement is the point: the store is shared
 * by the `/search` screen, the account-detail progress card and the « Tâches de
 * fond » panel, and all three previously derived their state purely from a
 * Socket.IO stream nobody replayed. Reconciling at the store level fixes all
 * three at once instead of teaching each surface its own recovery path — and it
 * keeps working while the user sits on an unrelated page, which is exactly when
 * a terminal event goes missing.
 *
 * Polling is deliberately modest (15 s) and stops the moment a run reaches a
 * terminal state; a live socket still delivers updates instantly, so this is a
 * safety net rather than the primary transport.
 */
export function useAnalysisStatusSync(): void {
  const { user } = useSession()
  const qc = useQueryClient()
  const runs = useAnalysisStore(s => s.runs)

  // ⚠️ Quand le repli d'origine est armé, les WebSockets ne passent pas (les
  // réécritures Vercel ne les proxifient pas) : ce sondage n'est plus un filet,
  // c'est le SEUL transport. À 15 s, la barre de progression bougerait quatre
  // fois par minute et l'utilisateur conclurait que le produit est bloqué.
  //
  // La valeur est relue à chaque rendu, et c'est ce qui la garde fraîche : la
  // sonde de démarrage tranche AVANT le premier rendu, et si le repli s'armait
  // plus tard, ce hook se re-rend de toute façon dès qu'un run entre dans le
  // store — c'est-à-dire au moment précis où la cadence commence à compter.
  const pollMs = analysisPollMs(!isFallbackArmed())

  // Only runs the client believes are in flight. A terminal run needs no
  // reconciling, so a finished analysis stops generating traffic.
  const pendingIds = Object.entries(runs)
    .filter(([, run]) => run.state === 'analyzing' || run.state === 'starting')
    .map(([accountId]) => accountId)
    .sort()

  const results = useQueries({
    queries: pendingIds.map(accountId => ({
      queryKey: analysisStatusKey(accountId),
      queryFn: () => fetchAnalysisStatus(accountId),
      enabled: !!user,
      refetchInterval: pollMs,
      // #3666.4 (recette prod 09/10) — React Query SUSPEND `refetchInterval`
      // dès que l'onglet passe en arrière-plan (`document.hidden`) : le bandeau
      // global restait affiché « En cours » plusieurs MINUTES après la fin
      // réelle, le temps que la personne revienne sur cet onglet. Ce sondage
      // EST le filet qui rattrape un événement Socket.IO manqué (voir le
      // docblock de `reconcileAnalysisStatus`) — un filet qui s'arrête quand on
      // ne regarde pas l'écran n'en est plus un. `refetchOnWindowFocus` reste :
      // il couvre en plus le cas où la fenêtre était restée fermée plus
      // longtemps que l'intervalle.
      refetchIntervalInBackground: true,
      // A user returning to the tab is the single most likely moment for the
      // client to be holding a stale picture — refetch immediately rather than
      // waiting out the interval.
      refetchOnWindowFocus: true,
      staleTime: 0,
      retry: 1,
    })),
  })

  // #3666 — le socket qui se reconnecte (le dernier désabonné le coupe, la
  // navigation suivante le rouvre) a pu rater l'événement de fin : on relit
  // l'état réel tout de suite, sans attendre le prochain tick de 15 s.
  useEffect(
    () => onSocketConnect(() => void qc.refetchQueries({ queryKey: ['analysis', 'status'], type: 'active' })),
    [qc],
  )

  const payloads = results.map(r => r.data)

  useEffect(() => {
    pendingIds.forEach((accountId, i) => {
      const data = payloads[i]
      if (data) reconcileAnalysisStatus(accountId, data, qc)
    })
    // `pendingIds` / `payloads` are re-derived each render; the effect is
    // idempotent (reconcile no-ops when nothing changed) so keying on their
    // serialised form keeps it from firing on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingIds.join(','), JSON.stringify(payloads), qc])
}
