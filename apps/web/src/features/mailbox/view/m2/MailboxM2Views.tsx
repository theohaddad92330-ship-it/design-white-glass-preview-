import type { MailThread } from '@bellum/contracts'
import { Box, Spinner, TabBar } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { outreachKeys, outreachMessagesApi } from '@/features/outreach/api'
import { useMyMessageDrafts, useScheduledSends, useTrackedThreads } from '../../api'
import {
  historyThreads,
  mergeDraftRows,
  upcomingThreads,
  type DraftRow,
  type MailboxView,
} from '../../lib/mailbox-views'
import { DraftsView } from './DraftsView'
import { HistoryView } from './HistoryView'
import { UpcomingView } from './UpcomingView'

const TABS: MailboxView[] = ['inbox', 'drafts', 'scheduled', 'history']

/**
 * Théo B m2-brouillons.R1 — les quatre onglets de la Messagerie, chacun avec son compteur. Un compteur non mesuré
 * (lecture en cours) n'affiche RIEN : jamais un « 0 » inventé (GA-18 / GA-19).
 */
export function MailboxViewTabs({ view, onChange }: { view: MailboxView; onChange: (view: MailboxView) => void }) {
  const { t } = useTranslation('mailbox')
  const drafts = useMyMessageDrafts()
  const sequences = useQuery({
    queryKey: outreachKeys.messages(),
    queryFn: () => outreachMessagesApi.list(),
    staleTime: 30_000,
  })
  const tracked = useTrackedThreads(true)
  const sends = useScheduledSends()

  const draftCount =
    drafts.data && sequences.data ? mergeDraftRows(drafts.data.items, sequences.data).length : undefined
  const upcomingCount =
    tracked.data && sends.data
      ? upcomingThreads(tracked.data.threads).length +
        sends.data.items.filter(item => item.status === 'scheduled').length
      : undefined
  const historyCount =
    tracked.data && sends.data ? historyThreads(tracked.data.threads, sends.data.items).length : undefined
  const counts: Partial<Record<MailboxView, number>> = {}
  if (draftCount !== undefined) counts.drafts = draftCount
  if (upcomingCount !== undefined) counts.scheduled = upcomingCount
  if (historyCount !== undefined) counts.history = historyCount

  return (
    <nav aria-label={t('m2.tabsAria')}>
      <TabBar
        tabs={TABS.map(key => ({ key, label: t(`m2.tabs.${key}`), count: counts[key] }))}
        activeTab={view}
        onTabChange={key => onChange(key as MailboxView)}
      />
    </nav>
  )
}

/** Les gestes d'un fil, tenus par la page (ses dialogues partagés) et ouverts depuis le volet de chaque vue. */
export type ThreadGestures = {
  onPrepareDraft: (thread: MailThread, kind: 'reply' | 'follow_up') => void
  onSnooze: (thread: MailThread) => void
  onCreateTask: (thread: MailThread) => void
  onLinkAccount: (thread: MailThread) => void
}

/** Le contenu des trois autres vues ; « À traiter » reste rendu par la page. */
export function MailboxM2Views({
  view,
  sequenceId,
  timeZone,
  language,
  mailboxAddress,
  gestures,
  matchesThread,
  matchesDraft,
  onNewMessage,
}: {
  view: Exclude<MailboxView, 'inbox'>
  sequenceId?: string
  timeZone: string
  language: string
  mailboxAddress: string | null
  gestures: ThreadGestures
  /** La recherche et le filtre de comptes de la barre d'outils (Théo B m2 : la même barre sur les quatre vues). */
  matchesThread: (thread: MailThread) => boolean
  matchesDraft: (row: DraftRow) => boolean
  onNewMessage: () => void
}) {
  const tracked = useTrackedThreads(true)
  if (view === 'drafts') {
    return <DraftsView timeZone={timeZone} sequenceId={sequenceId} matches={matchesDraft} onNewMessage={onNewMessage} />
  }
  if (tracked.isLoading) {
    return (
      <Box className="flex h-40 items-center justify-center">
        <Spinner />
      </Box>
    )
  }
  const threads = (tracked.data?.threads ?? []).filter(matchesThread)
  const shared = { threads, timeZone, language, mailboxAddress, gestures, onNewMessage }
  return view === 'scheduled' ? <UpcomingView {...shared} /> : <HistoryView {...shared} />
}
