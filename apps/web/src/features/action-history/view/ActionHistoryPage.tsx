import { useCallback, useMemo } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { TodayPage } from '@/features/today/TodayPage'
import type { HistoryTab } from '@/features/today/HistoryDrawer'

type ActionHistoryRouteId = '/actions/'

/** Les paramètres d'URL qui portaient un filtre du JOURNAL : un lien partagé ouvre donc le tiroir dessus. */
const JOURNAL_PARAMS = ['category', 'type', 'status', 'period', 'account', 'member'] as const

/** `?tab=` d'avant la file unique : l'onglet visé existe encore, dans le tiroir. */
const DRAWER_TAB_OF: Partial<Record<string, HistoryTab>> = {
  running: 'running',
  done: 'done',
  failed: 'failed',
  scheduled: 'scheduled',
  workflows: 'workflows',
}

/**
 * Lot L-A (#4164) — `/actions` est désormais « Aujourd'hui ».
 *
 * Cette enveloppe relit l'URL et la traduit pour la page, sans rien perdre des
 * liens existants :
 *  - `?tab=mine&overdue=true` (la tuile « En retard » du tableau de bord) montre
 *    la section « En retard » de la file unique ;
 *  - `?risk=` / `?agent=` (filtres de l'ancienne file « À valider ») deviennent des
 *    filtres du menu ; `?source=` (le déclencheur d'un workflow, plus fin que les
 *    quatre sources d'aujourd'hui) n'a plus d'équivalent et est ignoré ;
 *  - `?tab=running|done|failed|scheduled|workflows` et tout filtre du journal
 *    ouvrent le tiroir « Historique » sur la bonne vue.
 */
export function ActionHistoryPage({ from = '/actions/' }: { from?: ActionHistoryRouteId } = {}) {
  const search = useSearch({ from })
  const navigate = useNavigate({ from })

  const hasJournalParam = JOURNAL_PARAMS.some(param => search[param] !== undefined)
  const drawerTab: HistoryTab | undefined = search.tab
    ? DRAWER_TAB_OF[search.tab]
    : hasJournalParam
      ? 'journal'
      : undefined
  const initialFilters = useMemo(() => ({ risk: search.risk, agent: search.agent }), [search.risk, search.agent])
  const clearOverdue = useCallback(() => {
    void navigate({ search: previous => ({ ...previous, overdue: undefined, tab: undefined }) })
  }, [navigate])

  return (
    <TodayPage
      overdueOnly={search.overdue === true}
      initialFilters={initialFilters}
      historyOpen={drawerTab !== undefined}
      historyTab={drawerTab}
      onClearOverdue={clearOverdue}
    />
  )
}
