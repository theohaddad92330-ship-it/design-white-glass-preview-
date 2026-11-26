import type { MailThread } from '@bellum/contracts'
import { Badge, Box, EntityAvatar, Text } from '@bellum/ui'
import { Paperclip } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { decodeHtmlEntities } from '@/lib/decode-html-entities'
import { counterpartNameOf } from '../../lib/inbox-workspace'
import { MailListPanel } from '../shared/MailWorkspace'
import { ThreadStatePill } from './ThreadStatePill'

/**
 * Théo B m1 — la liste « Échanges à suivre » (`.v13-mail-list`) : une ligne dense par fil, qui OUVRE le volet de
 * lecture. Les gestes vivent dans le volet, pas sur la ligne.
 *
 * ⚠️ Doctrine c96 — la page de Théo montre le début du texte de chaque fil dans la liste. Le contenu d'un message ne
 * sort pas du fil courant : la ligne porte l'objet, la personne, l'heure et l'état, jamais un extrait du corps.
 */
export function ThreadList({
  threads,
  selectedId,
  highlightedId,
  language,
  truncated,
  onSelect,
}: {
  threads: MailThread[]
  selectedId: string | null
  highlightedId: string | null
  language: string
  truncated: boolean
  onSelect: (thread: MailThread) => void
}) {
  const { t } = useTranslation('mailbox')
  return (
    <MailListPanel
      titleId="mailbox-list-title"
      title={t('list.title')}
      count={threads.length}
      listLabel={t('list.aria')}
      foot={
        <Text
          size="xs"
          className="border-t border-[var(--bellum-border)] px-4 py-3 text-[var(--bellum-text-secondary)]"
        >
          {truncated ? t('page.truncated') : t('list.foot')}
        </Text>
      }
    >
      {threads.map(thread => (
        <ThreadListRow
          key={thread.threadId}
          thread={thread}
          language={language}
          selected={thread.threadId === selectedId}
          highlighted={thread.threadId === highlightedId}
          onSelect={() => onSelect(thread)}
        />
      ))}
    </MailListPanel>
  )
}

/**
 * Une ligne de fil, partagée par « À traiter », « À venir » et « Historique ». `aside` remplace l'heure (la date de
 * retour d'un fil reporté) et `pill` s'ajoute à l'état (« Reporté »).
 */
export function ThreadListRow({
  thread,
  language,
  selected,
  highlighted = false,
  aside,
  pill,
  onSelect,
}: {
  thread: MailThread
  language: string
  selected: boolean
  highlighted?: boolean
  aside?: string
  pill?: ReactNode
  onSelect: () => void
}) {
  const { t } = useTranslation('mailbox')
  const row = useRef<HTMLLIElement>(null)
  // Le fil désigné depuis « Aujourd'hui » peut être en bas d'une liste de quarante.
  useEffect(() => {
    if (highlighted) row.current?.scrollIntoView?.({ block: 'center' })
  }, [highlighted])

  const name = counterpartNameOf(thread)
  // #3533 — un fil sans objet ne s'écrit jamais « (sans objet) » : l'interlocuteur tient la place du titre.
  const subject = decodeHtmlEntities(thread.subject?.trim() ? thread.subject : null)
  const headline = subject ?? name ?? t('thread.messages', { count: thread.messageCount })
  const at = thread.lastMessageAt ? new Date(thread.lastMessageAt) : null
  const sameDay = at ? at.toDateString() === new Date().toDateString() : false
  const when = at
    ? new Intl.DateTimeFormat(
        language,
        sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' },
      ).format(at)
    : null

  return (
    <li ref={row} data-highlighted={highlighted ? 'true' : undefined}>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        title={headline}
        className={`flex min-h-11 w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)] ${
          selected ? 'bg-[var(--bellum-accent-bg)]' : highlighted ? 'bg-[var(--bellum-surface-2)]' : ''
        }`}
      >
        <Box className="flex items-center gap-2">
          <EntityAvatar name={name ?? '?'} size="xs" />
          <Text
            element="span"
            size="sm"
            weight={thread.unread ? 'semibold' : 'medium'}
            className="min-w-0 flex-1 truncate"
          >
            {thread.unread ? (
              <span
                aria-label={t('thread.unread')}
                className="mr-1.5 inline-block size-2 rounded-full bg-[var(--bellum-text-accent)] align-middle"
              />
            ) : null}
            {name ?? t('thread.noCounterpart')}
          </Text>
          {(aside ?? when) ? (
            <Text element="span" size="xs" className="shrink-0 tabular-nums text-[var(--bellum-text-secondary)]">
              {aside ?? when}
            </Text>
          ) : null}
        </Box>
        {subject ? (
          <Text element="span" size="sm" weight="medium" className="line-clamp-2 break-words">
            {subject}
          </Text>
        ) : null}
        <Box className="flex min-w-0 flex-wrap items-center gap-1.5">
          {pill}
          <ThreadStatePill thread={thread} />
          {thread.awaitingReply && thread.daysSinceLastMessage !== null ? (
            <Badge variant="outline">{t('thread.silentFor', { count: thread.daysSinceLastMessage })}</Badge>
          ) : null}
          {thread.hasAttachments ? (
            <Paperclip
              className="size-3 shrink-0 text-[var(--bellum-text-secondary)]"
              aria-label={t('thread.attachment')}
            />
          ) : null}
          {thread.account ? (
            <Text element="span" size="xs" className="truncate text-[var(--bellum-text-secondary)]">
              {thread.account.name}
            </Text>
          ) : null}
          {/* #5003.1 — une ESN rapprochée est ÉTIQUETÉE, jamais retirée de la liste. */}
          {thread.account?.isEsn ? <Badge variant="outline">{t('thread.esn')}</Badge> : null}
        </Box>
      </button>
    </li>
  )
}
