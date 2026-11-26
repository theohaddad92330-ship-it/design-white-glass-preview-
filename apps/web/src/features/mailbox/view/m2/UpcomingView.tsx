import type { MailThread } from '@bellum/contracts'
import { Badge, Box } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useScheduledSends } from '../../api'
import { upcomingThreads } from '../../lib/mailbox-views'
import { ThreadListRow } from '../m1/ThreadList'
import { ThreadReader } from '../m1/ThreadReader'
import { ScheduledSendsPanel } from '../ScheduledSendsPanel'
import { MailListPanel, MailWorkspace } from '../shared/MailWorkspace'
import { MailboxEmptyView } from './MailboxEmptyView'
import type { ThreadGestures } from './MailboxM2Views'

/**
 * Théo B m2-brouillons.N3 — « Préparations à venir » : les échanges que le commercial a REPORTÉS (ils reviennent dans
 * « À traiter » à la date choisie — aucun e-mail ni rappel externe), dans l'espace de travail de la page : la liste à
 * gauche, le fil ouvert à droite avec sa date de retour, « Changer la date » et « Remettre à traiter ». Les messages
 * PROGRAMMÉS (un brouillon validé part par sa boîte, à l'heure choisie) restent listés dessous.
 */
export function UpcomingView({
  threads,
  timeZone,
  language,
  mailboxAddress,
  gestures,
  onNewMessage,
}: {
  threads: MailThread[]
  timeZone: string
  language: string
  mailboxAddress: string | null
  gestures: ThreadGestures
  onNewMessage?: () => void
}) {
  const { t } = useTranslation('mailbox')
  const snoozed = upcomingThreads(threads)
  const sends = useScheduledSends().data?.items ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const selected = snoozed.find(thread => thread.threadId === selectedId) ?? snoozed[0] ?? null
  const day = (iso: string) =>
    new Intl.DateTimeFormat(language, { weekday: 'short', day: 'numeric', month: 'short', timeZone }).format(
      new Date(iso),
    )

  if (snoozed.length === 0 && sends.length === 0) {
    // Les envois « à programmer » (brouillons validés) s'affichent dans le panneau même sans envoi daté.
    return (
      <Box className="flex flex-col gap-4">
        <ScheduledSendsPanel timeZone={timeZone} />
        <MailboxEmptyView onNewMessage={onNewMessage} />
      </Box>
    )
  }

  return (
    <Box className="flex flex-col gap-4">
      {snoozed.length > 0 ? (
        <MailWorkspace
          reading={reading}
          list={
            <MailListPanel
              titleId="mailbox-upcoming-title"
              title={t('m2.upcoming.title')}
              count={snoozed.length}
              listLabel={t('m2.upcoming.listAria')}
            >
              {snoozed.map(thread => (
                <ThreadListRow
                  key={thread.threadId}
                  thread={thread}
                  language={language}
                  selected={thread.threadId === selected?.threadId}
                  aside={thread.snoozeUntil ? day(thread.snoozeUntil) : undefined}
                  pill={<Badge variant="info">{t('m2.upcoming.badge')}</Badge>}
                  onSelect={() => {
                    setSelectedId(thread.threadId)
                    setReading(true)
                  }}
                />
              ))}
            </MailListPanel>
          }
          reader={
            selected ? (
              <ThreadReader
                variant="upcoming"
                thread={selected}
                foundBy={null}
                language={language}
                timeZone={timeZone}
                mailboxAddress={mailboxAddress}
                onBack={() => setReading(false)}
                onPrepareDraft={kind => gestures.onPrepareDraft(selected, kind)}
                onLinkAccount={() => gestures.onLinkAccount(selected)}
                onSnooze={() => gestures.onSnooze(selected)}
                onCreateTask={() => gestures.onCreateTask(selected)}
              />
            ) : null
          }
        />
      ) : null}
      <ScheduledSendsPanel timeZone={timeZone} />
    </Box>
  )
}
