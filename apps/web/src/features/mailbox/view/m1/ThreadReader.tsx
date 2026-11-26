import type { MailMessage, MailSearchIntent, MailThread } from '@bellum/contracts'
import { Badge, Box, Button, EntityAvatar, Text, TYPE_SCALE } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Archive, ArrowLeft, ArrowRight, Paperclip } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AskLaura } from '@/components/primitives/AskLaura'
import { decodeHtmlEntities } from '@/lib/decode-html-entities'
import { useSetThreadMark, useSnoozeThread } from '../../api'
import { isAutomatedSender } from '../../lib/automated-sender'
import { counterpartNameOf } from '../../lib/inbox-workspace'
import { MailReaderFrame } from '../shared/MailWorkspace'
import { ThreadStatePill } from './ThreadStatePill'

/**
 * #1401 — la passerelle « ce mail peut devenir… ». Elle dépend de l'intention qui a TROUVÉ le fil : un fil ne porte
 * pas d'étiquette métier, et deviner sur l'objet donnerait une fausse porte une fois sur trois.
 */
const INTENT_BRIDGE: Partial<Record<MailSearchIntent, { to: string; key: string }>> = {
  positive_reply: { to: '/projects', key: 'positiveReply' },
  job_description: { to: '/projects/needs', key: 'jobDescription' },
  cv: { to: '/consultants', key: 'cv' },
  tender: { to: '/projects', key: 'tender' },
  invoice: { to: '/missions/facturation', key: 'invoice' },
  meeting: { to: '/briefing', key: 'meeting' },
}

/**
 * Théo B m1 — le VOLET DE LECTURE (`.v13-mail-reader`), à droite de la liste sur bureau, à sa place sur mobile.
 *
 * Ordre de la page appliquée : barre du fil (état · boîte · archiver) → objet → expéditeur, adresse, date → dossier,
 * fiche contact, associer → « Lu depuis ta boîte, jamais conservé » → les échanges → « Ce mail peut devenir » →
 * les gestes (Préparer la réponse · Marquer traité · Reporter · Créer une tâche) → « Origine & visibilité ».
 *
 * ⚠️ Doctrine c96 : le contenu n'existe que dans CE fil, pour son propriétaire. Il voyage avec le fil (les extraits que
 * la boîte renvoie), il n'est ni conservé, ni copié dans la liste, ni montré à un collègue.
 */
export function ThreadReader({
  thread,
  foundBy,
  language,
  mailboxAddress,
  onBack,
  onPrepareDraft,
  onLinkAccount,
  onSnooze,
  onCreateTask,
  variant = 'inbox',
  timeZone,
}: {
  thread: MailThread
  foundBy: MailSearchIntent | null
  language: string
  mailboxAddress: string | null
  /**
   * La vue qui l'ouvre : « À traiter » (tous les gestes), « À venir » (le report : changer la date, remettre à
   * traiter) ou « Historique » (remettre à traiter). Le même volet, les gestes de SA vue (Théo B m2).
   */
  variant?: 'inbox' | 'upcoming' | 'history'
  timeZone?: string
  onBack: () => void
  onPrepareDraft: (kind: 'reply' | 'follow_up') => void
  onLinkAccount: () => void
  onSnooze: () => void
  onCreateTask: () => void
}) {
  const { t } = useTranslation('mailbox')
  const setMark = useSetThreadMark()
  const snooze = useSnoozeThread()
  const toggleMark = (mark: 'treated' | 'irrelevant') =>
    setMark.mutate({ threadId: thread.threadId, mark: thread.state === mark ? null : mark })

  const subject = decodeHtmlEntities(thread.subject?.trim() ? thread.subject : null)
  const name = counterpartNameOf(thread)
  const when = thread.lastMessageAt
    ? new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
        new Date(thread.lastMessageAt),
      )
    : null
  // Du plus récent au plus ancien : « que s'est-il passé en dernier ? ».
  const messages = [...(thread.messages ?? [])].reverse()
  const bridge = foundBy ? INTENT_BRIDGE[foundBy] : undefined

  return (
    <MailReaderFrame label={t('reader.aria')}>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium text-[var(--bellum-text-accent)] md:hidden"
      >
        <ArrowLeft className="size-4 shrink-0" aria-hidden />
        {t('reader.back')}
      </button>

      <Box className="flex flex-wrap items-center justify-between gap-2">
        <Box className="flex flex-wrap items-center gap-2">
          {variant === 'upcoming' ? <Badge variant="info">{t('m2.upcoming.badge')}</Badge> : null}
          <ThreadStatePill thread={thread} />
          {mailboxAddress ? (
            <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
              {mailboxAddress}
            </Text>
          ) : null}
        </Box>
        <Button
          size="sm"
          variant="ghost"
          className="min-h-11 min-w-11"
          aria-label={t('reader.archive')}
          title={t('reader.archive')}
          disabled={setMark.isPending}
          // L'archivage se range sous « traité » côté serveur : le fil part dans l'Historique, d'où il se remet à traiter.
          onClick={() => setMark.mutate({ threadId: thread.threadId, mark: 'archived' })}
        >
          <Archive className="size-4" aria-hidden />
        </Button>
      </Box>

      <Text element="h2" className={`${TYPE_SCALE.pageTitle} break-words`}>
        {subject ?? name ?? t('thread.messages', { count: thread.messageCount })}
      </Text>

      <Box className="flex items-center gap-3">
        <EntityAvatar name={name ?? '?'} size="sm" />
        <Box className="flex min-w-0 flex-col">
          {thread.counterpart && thread.contactId ? (
            <Link
              to="/contacts/$id"
              params={{ id: thread.contactId }}
              className="truncate text-sm font-semibold hover:text-[var(--bellum-text-accent)] hover:underline"
              title={t('thread.contactTooltip', { name: name ?? thread.counterpart })}
            >
              {name}
            </Link>
          ) : (
            <Text size="sm" weight="semibold" className="truncate">
              {name ?? t('drawer.unknownCounterpart')}
            </Text>
          )}
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {[thread.counterpart && thread.counterpart !== name ? thread.counterpart : null, when]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Box>
      </Box>

      <Box className="flex flex-wrap items-center gap-2" data-testid="mailbox-reader-context">
        {thread.account ? (
          <Link
            to="/accounts/$id"
            params={{ id: thread.account.id }}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
          >
            {t('drawer.openAccount', { name: thread.account.name })}
            <ArrowRight className="size-3.5 shrink-0" aria-hidden />
          </Link>
        ) : (
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('drawer.noAccount')}
          </Text>
        )}
        {thread.contactId ? (
          <Link
            to="/contacts/$id"
            params={{ id: thread.contactId }}
            className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
          >
            {t('reader.contactCard')}
          </Link>
        ) : null}
        {/* #2104.6 — « Associer » n'apparaît QUE quand rien ne rattache déjà le fil avec certitude. */}
        {!thread.account ? (
          <Button size="sm" variant="ghost" className="min-h-11" onClick={onLinkAccount}>
            {t('reader.associate')}
          </Button>
        ) : null}
      </Box>

      {variant === 'upcoming' && thread.snoozeUntil ? (
        <Box className="flex flex-col gap-2 rounded-control bg-[var(--info-soft-bg)] p-3" data-testid="mailbox-snoozed">
          <Text size="sm" weight="medium" className="text-[var(--info-soft-text)]">
            {t('m2.upcoming.returns', {
              date: new Intl.DateTimeFormat(language, {
                dateStyle: 'full',
                timeStyle: 'short',
                ...(timeZone ? { timeZone } : {}),
              }).format(new Date(thread.snoozeUntil)),
            })}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('m2.upcoming.noExternal')}
          </Text>
          <Box className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="min-h-11" onClick={onSnooze}>
              {t('m2.upcoming.changeDate')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11"
              disabled={snooze.isPending}
              onClick={() => snooze.mutate({ threadId: thread.threadId, until: null })}
            >
              {t('m2.upcoming.putBack')}
            </Button>
          </Box>
        </Box>
      ) : null}

      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('reader.liveNote')}
      </Text>

      <Box className="flex flex-col gap-2" data-testid="mailbox-reader-content">
        <Text element="h3" size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
          {t('drawer.history')}
        </Text>
        {messages.length === 0 ? (
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('drawer.historyUnavailable')}
          </Text>
        ) : (
          messages.map(message => <MessageBlock key={message.id} message={message} language={language} />)
        )}
      </Box>

      {bridge ? (
        <Box className="flex flex-wrap items-center gap-2 rounded-control bg-[var(--bellum-surface-2)] p-3">
          <Text size="xs" weight="medium">
            {t('bridge.title')}
          </Text>
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t(`bridge.${bridge.key}`)}
          </Text>
          <Button asChild size="sm" variant="outline" className="min-h-11">
            <Link to={bridge.to}>
              {t(`bridge.${bridge.key}Cta`)}
              <ArrowRight className="ml-1 size-3.5 shrink-0" aria-hidden />
            </Link>
          </Button>
        </Box>
      ) : null}

      <Box className="flex flex-wrap items-center gap-2 border-t border-[var(--bellum-border)] pt-4">
        {/* #4405.1 — un fil système (no-reply) n'a personne à qui répondre : le geste ne se propose pas, la ligne le dit. */}
        {isAutomatedSender(thread.counterpart) ? (
          <Text size="xs" className="text-[var(--bellum-text-secondary)]" data-testid="no-reply-note">
            {t('reader.noReplyNote')}
          </Text>
        ) : (
          <Button className="min-h-11" disabled={!thread.counterpart} onClick={() => onPrepareDraft('reply')}>
            {t('reader.prepareReply')}
          </Button>
        )}
        {variant === 'inbox' && thread.awaitingReply ? (
          <Button
            variant="outline"
            className="min-h-11"
            disabled={!thread.counterpart}
            onClick={() => onPrepareDraft('follow_up')}
          >
            {t('thread.followUp')}
          </Button>
        ) : null}
        {variant === 'inbox' ? (
          <Button
            variant="outline"
            className="min-h-11"
            disabled={setMark.isPending}
            onClick={() => toggleMark('treated')}
          >
            {t(thread.state === 'treated' ? 'actions.unmarkTreated' : 'reader.markTreated')}
          </Button>
        ) : null}
        {variant === 'history' ? (
          <Button
            variant="outline"
            className="min-h-11"
            disabled={setMark.isPending}
            onClick={() => setMark.mutate({ threadId: thread.threadId, mark: null })}
          >
            {t('m2.history.putBack')}
          </Button>
        ) : null}
        {variant !== 'upcoming' ? (
          <Button variant="ghost" className="min-h-11" onClick={onSnooze}>
            {t('actions.snooze')}
          </Button>
        ) : null}
        <Button variant="ghost" className="min-h-11" onClick={onCreateTask}>
          {t('actions.createTask')}
        </Button>
        {variant === 'inbox' ? (
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={setMark.isPending}
            onClick={() => toggleMark('irrelevant')}
          >
            {t(thread.state === 'irrelevant' ? 'actions.unmarkIrrelevant' : 'actions.markIrrelevant')}
          </Button>
        ) : null}
        <AskLaura
          question={t('drawer.askLaura', { subject: subject ?? name ?? '' })}
          label={t('drawer.askLauraLabel')}
          {...(thread.account ? { accountId: thread.account.id } : {})}
        />
      </Box>

      <details className="rounded-control border border-[var(--bellum-border)] px-3 py-2">
        <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">{t('reader.origin')}</summary>
        <Box className="flex flex-col gap-1 pb-2">
          {mailboxAddress ? (
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {when
                ? t('reader.originLine', { address: mailboxAddress, date: when })
                : t('reader.originAddress', { address: mailboxAddress })}
            </Text>
          ) : null}
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('reader.visibility')}
          </Text>
        </Box>
      </details>
    </MailReaderFrame>
  )
}

/** Un message du fil : qui, quand, et l'extrait que la boîte renvoie — dans CE fil seulement (c96). */
function MessageBlock({ message, language }: { message: MailMessage; language: string }) {
  const { t } = useTranslation('mailbox')
  const when = message.date
    ? new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
        new Date(message.date),
      )
    : null
  return (
    <Box className="flex flex-col gap-1 rounded-control border border-[var(--bellum-border)] p-3">
      <Box className="flex items-center justify-between gap-2">
        <Text size="xs" weight="medium" className="truncate">
          {message.direction === 'outbound'
            ? t('drawer.fromMe')
            : (decodeHtmlEntities(message.from) ?? t('drawer.unknownSender'))}
        </Text>
        <Box className="flex shrink-0 items-center gap-1.5">
          {message.hasAttachments ? (
            <Paperclip className="size-3 text-[var(--bellum-text-secondary)]" aria-label={t('thread.attachment')} />
          ) : null}
          {when ? (
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {when}
            </Text>
          ) : null}
        </Box>
      </Box>
      {message.snippet ? (
        <Text size="sm" className="whitespace-pre-line">
          {decodeHtmlEntities(message.snippet)}
        </Text>
      ) : null}
    </Box>
  )
}
