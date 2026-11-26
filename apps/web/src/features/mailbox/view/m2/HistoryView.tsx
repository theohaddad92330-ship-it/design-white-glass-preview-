import type { MailThread, ScheduledMessageSendItem } from '@bellum/contracts'
import { Badge, Box, EntityAvatar, Text, TYPE_SCALE } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useScheduledSends } from '../../api'
import { historyThreads, type HistoryRow } from '../../lib/mailbox-views'
import { ThreadListRow } from '../m1/ThreadList'
import { ThreadReader } from '../m1/ThreadReader'
import { MailListPanel, MailReaderFrame, MailWorkspace } from '../shared/MailWorkspace'
import { MailboxEmptyView } from './MailboxEmptyView'
import type { ThreadGestures } from './MailboxM2Views'

/**
 * Théo B m2-brouillons.N4 / A5 — « Journal des échanges », dans l'espace de travail de la page : les échanges traités
 * (« Remettre à traiter » les rouvre) et les messages PARTIS avec leur preuve — « Envoyé le … » n'existe que si le
 * message a été retrouvé dans les éléments envoyés de la boîte. Le contenu d'un échange vit dans son fil, jamais ici.
 */
export function HistoryView({
  threads,
  language,
  timeZone,
  mailboxAddress,
  gestures,
  onNewMessage,
}: {
  threads: MailThread[]
  language: string
  timeZone: string
  mailboxAddress: string | null
  gestures: ThreadGestures
  onNewMessage?: () => void
}) {
  const { t } = useTranslation('mailbox')
  const sends = useScheduledSends().data?.items ?? []
  const rows = historyThreads(threads, sends)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const keyOf = (row: HistoryRow) => row.threadId ?? row.sendId ?? ''
  const selected = rows.find(row => keyOf(row) === selectedKey) ?? rows[0] ?? null
  const format = (iso: string) =>
    new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(iso))

  if (rows.length === 0) return <MailboxEmptyView onNewMessage={onNewMessage} />

  const open = (row: HistoryRow) => {
    setSelectedKey(keyOf(row))
    setReading(true)
  }

  return (
    <MailWorkspace
      reading={reading}
      list={
        <MailListPanel
          titleId="mailbox-history-title"
          title={t('m2.history.title')}
          count={rows.length}
          listLabel={t('m2.history.listAria')}
        >
          {rows.map(row =>
            row.thread ? (
              <ThreadListRow
                key={keyOf(row)}
                thread={row.thread}
                language={language}
                selected={selected !== null && keyOf(selected) === keyOf(row)}
                onSelect={() => open(row)}
              />
            ) : row.send ? (
              <SentListRow
                key={keyOf(row)}
                send={row.send}
                when={format(row.at)}
                selected={selected !== null && keyOf(selected) === keyOf(row)}
                onSelect={() => open(row)}
              />
            ) : null,
          )}
        </MailListPanel>
      }
      reader={
        selected?.thread ? (
          <ThreadReader
            variant="history"
            thread={selected.thread}
            foundBy={null}
            language={language}
            timeZone={timeZone}
            mailboxAddress={mailboxAddress}
            onBack={() => setReading(false)}
            onPrepareDraft={kind => selected.thread && gestures.onPrepareDraft(selected.thread, kind)}
            onLinkAccount={() => selected.thread && gestures.onLinkAccount(selected.thread)}
            onSnooze={() => selected.thread && gestures.onSnooze(selected.thread)}
            onCreateTask={() => selected.thread && gestures.onCreateTask(selected.thread)}
          />
        ) : selected?.send ? (
          <SentReader send={selected.send} when={format(selected.at)} />
        ) : null
      }
    />
  )
}

function SentListRow({
  send,
  when,
  selected,
  onSelect,
}: {
  send: ScheduledMessageSendItem
  when: string
  selected: boolean
  onSelect: () => void
}) {
  const { t } = useTranslation('mailbox')
  const subject = send.subject ?? t('scheduled.noSubject')
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        title={subject}
        className={`flex min-h-11 w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)] ${
          selected ? 'bg-[var(--bellum-accent-bg)]' : ''
        }`}
      >
        <Box className="flex items-center gap-2">
          <EntityAvatar name={t('drawer.fromMe')} size="xs" />
          <Text element="span" size="sm" weight="medium" className="min-w-0 flex-1 truncate">
            {t('drawer.fromMe')}
          </Text>
          <Text element="span" size="xs" className="shrink-0 tabular-nums text-[var(--bellum-text-secondary)]">
            {when}
          </Text>
        </Box>
        <Text element="span" size="sm" weight="medium" className="line-clamp-2 break-words">
          {subject}
        </Text>
        <Box className="flex items-center gap-1.5">
          <Badge variant="success">{t('m2.history.sent')}</Badge>
        </Box>
      </button>
    </li>
  )
}

/** Un message PARTI : la preuve (retrouvé dans les éléments envoyés), jamais son contenu. */
function SentReader({ send, when }: { send: ScheduledMessageSendItem; when: string }) {
  const { t } = useTranslation('mailbox')
  return (
    <MailReaderFrame label={t('m2.history.sentAria')}>
      <Box className="flex items-center gap-2">
        <Badge variant="success">{t('m2.history.sent')}</Badge>
      </Box>
      <Text element="h2" className={`${TYPE_SCALE.pageTitle} break-words`}>
        {send.subject ?? t('scheduled.noSubject')}
      </Text>
      <Box className="flex flex-col gap-1 rounded-control bg-[var(--success-soft-bg)] p-3">
        <Text size="sm" weight="medium" className="text-[var(--success-soft-text)]">
          {t('m2.history.sentOn', { date: when })}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('m2.history.proof')}
        </Text>
      </Box>
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('m2.history.visibility')}
      </Text>
    </MailReaderFrame>
  )
}
