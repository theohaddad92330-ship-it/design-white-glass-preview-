import { Badge, cn } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { outreachKeys, outreachMessagesApi } from '@/features/outreach/api'
import { useMyMessageDrafts, useScheduledSends, useTrackedThreads } from '@/features/mailbox/api'
import { historyThreads, mergeDraftRows, upcomingThreads, type MailboxView } from '@/features/mailbox/lib/mailbox-views'
import { HIDDEN_WHEN_COLLAPSED } from './collapsed'
import { formatNavBadgeCount } from './nav-badge'

/**
 * #4492.1 (PR 12C, maquette V22 `.v13-navsub`) — le compteur d'une vue de la Messagerie sous son entrée.
 *
 * Il n'est monté que quand la Messagerie est ouverte (la sous-navigation ne se déplie que sous l'entrée
 * active) : les requêtes sont celles que l'écran vient de faire (`MailboxViewTabs`, mêmes clés), donc lues
 * dans le cache, et le compte suit les MÊMES règles (`mergeDraftRows`, `upcomingThreads`, `historyThreads`).
 * Une mesure absente ne dit rien — jamais un « 0 » (GA-18, `formatNavBadgeCount`). « À traiter » n'a pas
 * de compteur dans l'écran : il n'en a pas ici non plus.
 */
export function MailboxViewCount({ view }: { view: MailboxView }) {
  const drafts = useMyMessageDrafts()
  const sequences = useQuery({
    queryKey: outreachKeys.messages(),
    queryFn: () => outreachMessagesApi.list(),
    staleTime: 30_000,
  })
  const tracked = useTrackedThreads(true)
  const sends = useScheduledSends()
  const count =
    view === 'drafts'
      ? drafts.data && sequences.data
        ? mergeDraftRows(drafts.data.items, sequences.data).length
        : undefined
      : view === 'scheduled'
        ? tracked.data && sends.data
          ? upcomingThreads(tracked.data.threads).length +
            sends.data.items.filter(item => item.status === 'scheduled').length
          : undefined
        : view === 'history'
          ? tracked.data && sends.data
            ? historyThreads(tracked.data.threads, sends.data.items).length
            : undefined
          : undefined
  const text = formatNavBadgeCount(count)
  return text ? (
    <Badge variant="default" className={cn('ml-auto shrink-0', HIDDEN_WHEN_COLLAPSED)}>
      {text}
    </Badge>
  ) : null
}
