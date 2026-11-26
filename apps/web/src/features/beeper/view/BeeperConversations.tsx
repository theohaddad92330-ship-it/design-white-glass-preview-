import type { BeeperConversation } from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Text,
  Textarea,
} from '@bellum/ui'
import { MessageSquareReply, Send, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOpenLauraInPlace } from '@/features/laura/bubble/use-open-laura-in-place'
import { useBeeperConversations, useBeeperMessages, useBeeperSend, useBeeperStatus } from '../api'

/**
 * #4406.4 — Messagerie › les conversations BEEPER de l'utilisateur, lues EN DIRECT à l'ouverture.
 *
 * - **Sans connexion = rien** : ni section, ni appel (`useBeeperConversations` n'est activé que branché).
 * - **Injoignable est NOMMÉ** (Desktop fermé, tunnel coupé) — jamais une liste vide qui passerait pour
 *   « aucune conversation ».
 * - Chaque conversation porte son RÉSEAU, ses coordonnées en clair (c87) et, s'il est connu, le contact
 *   Bellum rattaché (proposé, jamais fusionné).
 * - « Préparer la réponse » : la même forme que la boîte (`DraftDialog`) — le texte se relit ici, Laura
 *   peut le préparer (c96), et **l'envoi ne part que sur le clic de l'utilisateur** (porte d'écriture).
 */
export function BeeperConversations() {
  const { t } = useTranslation('mailbox', { keyPrefix: 'beeper' })
  const status = useBeeperStatus()
  const state = status.data?.state ?? 'disconnected'
  const linked = state === 'connected' || state === 'unreachable'
  const conversations = useBeeperConversations(linked)
  const [replyTo, setReplyTo] = useState<BeeperConversation | null>(null)

  if (!status.data || state === 'disconnected') return null

  const result = conversations.data
  return (
    <Box
      as="section"
      aria-labelledby="beeper-conversations-title"
      className="flex flex-col gap-2"
      data-testid="beeper-conversations"
    >
      <Text
        id="beeper-conversations-title"
        element="h2"
        size="sm"
        weight="semibold"
        color="text-[var(--bellum-text-primary)]"
      >
        {t('title')}
      </Text>
      {state === 'pending' || result?.state === 'pending' ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('pending')}
        </Text>
      ) : result?.state === 'unreachable' ? (
        <Text size="xs" role="status" className="text-[var(--warning-soft-text)]" data-testid="beeper-unreachable">
          {t('unreachable', { reason: result.reason })}
        </Text>
      ) : result?.state === 'connected' ? (
        result.conversations.length === 0 ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('empty')}
          </Text>
        ) : (
          <ul className="flex flex-col gap-2">
            {result.conversations.map(conversation => (
              <li key={conversation.chatId}>
                <ConversationRow conversation={conversation} onReply={() => setReplyTo(conversation)} />
              </li>
            ))}
          </ul>
        )
      ) : conversations.isError ? (
        <Text size="xs" role="status" className="text-[var(--danger-soft-text)]">
          {t('failed')}
        </Text>
      ) : null}
      <BeeperReplyDialog conversation={replyTo} onClose={() => setReplyTo(null)} />
    </Box>
  )
}

function ConversationRow({ conversation, onReply }: { conversation: BeeperConversation; onReply: () => void }) {
  const { t } = useTranslation('mailbox', { keyPrefix: 'beeper' })
  const others = conversation.participants.filter(p => !p.isSelf)
  return (
    <Card className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
      <Box className="flex min-w-0 flex-col gap-1">
        <Box display="flex" className="flex-wrap items-center gap-2">
          <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]" className="truncate">
            {conversation.title ??
              others
                .map(p => p.fullName)
                .filter(Boolean)
                .join(', ') ??
              t('untitled')}
          </Text>
          {conversation.network ? <Badge variant="outline">{conversation.network}</Badge> : null}
          {/* Une absence de compteur reste une absence : jamais « 0 non lu » inventé (GA-18). */}
          {conversation.unreadCount ? <Badge>{t('unread', { count: conversation.unreadCount })}</Badge> : null}
        </Box>
        {others.length === 1 ? (
          <Text size="xs" className="break-all text-[var(--bellum-text-secondary)]">
            {[others[0]?.phoneNumber, others[0]?.email, others[0]?.username].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        {conversation.contact ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]" data-testid="beeper-contact-match">
            {t('contactMatch', {
              name: conversation.contact.fullName ?? '',
              on: t(`matchedOn.${conversation.contact.matchedOn}`),
            })}
          </Text>
        ) : null}
      </Box>
      <Button size="sm" variant="outline" className="min-h-11 gap-1.5 self-start md:self-center" onClick={onReply}>
        <MessageSquareReply aria-hidden className="size-4" />
        {t('prepareReply')}
      </Button>
    </Card>
  )
}

function BeeperReplyDialog({
  conversation,
  onClose,
}: {
  conversation: BeeperConversation | null
  onClose: () => void
}) {
  const { t } = useTranslation('mailbox', { keyPrefix: 'beeper' })
  const { t: tCommon } = useTranslation('common')
  const messages = useBeeperMessages(conversation?.chatId ?? null)
  const send = useBeeperSend()
  const openLaura = useOpenLauraInPlace()
  const [text, setText] = useState('')
  // Une clé d'idempotence par ouverture : un double clic n'envoie pas deux fois.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  const close = () => {
    setText('')
    setIdempotencyKey(crypto.randomUUID())
    send.reset()
    onClose()
  }

  const recent = messages.data?.state === 'connected' ? messages.data.messages.slice(-5) : []
  const lastInbound = [...recent].reverse().find(m => !m.isSender)
  const name = conversation?.title ?? ''

  const submit = () => {
    if (!conversation || !text.trim()) return
    send.mutate({
      chatId: conversation.chatId,
      body: { text: text.trim(), idempotencyKey, ...(lastInbound ? { replyToMessageId: lastInbound.id } : {}) },
    })
  }

  return (
    <Dialog open={conversation !== null} onOpenChange={open => (open ? undefined : close())}>
      <DialogContent closeLabel={tCommon('actions.close')} className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('replyTitle', { name })}</DialogTitle>
          <DialogDescription>{t('replyDescription', { network: conversation?.network ?? 'Beeper' })}</DialogDescription>
        </DialogHeader>

        {messages.data?.state === 'unreachable' ? (
          <Text size="xs" role="status" className="text-[var(--warning-soft-text)]">
            {t('unreachable', { reason: messages.data.reason })}
          </Text>
        ) : (
          <ol className="flex flex-col gap-1.5" data-testid="beeper-recent-messages">
            {recent.map(m => (
              <li key={m.id} className="rounded-md bg-[var(--bellum-surface-2)] p-2">
                <Text size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
                  {m.isSender ? t('you') : (m.senderName ?? t('them'))}
                </Text>
                <Text element="p" size="xs" className="whitespace-pre-wrap text-[var(--bellum-text-primary)]">
                  {m.text ?? t('noText')}
                </Text>
              </li>
            ))}
          </ol>
        )}

        <Box display="flex" className="flex-col gap-1">
          <Label htmlFor="beeper-reply" className="text-xs">
            {t('replyLabel')}
          </Label>
          <Textarea id="beeper-reply" rows={5} value={text} onChange={event => setText(event.target.value)} />
          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('neverAlone')}
          </Text>
        </Box>

        {send.data ? (
          <Text size="xs" role="status" className="text-[var(--success-soft-text)]" data-testid="beeper-sent">
            {send.data.status === 'already_done' ? t('alreadySent') : t('sent')}
          </Text>
        ) : send.error ? (
          <Text size="xs" role="status" className="text-[var(--danger-soft-text)]">
            {t('sendFailed', { error: send.error instanceof Error ? send.error.message : '' })}
          </Text>
        ) : null}

        <DialogFooter className="flex flex-wrap gap-2">
          {openLaura && conversation ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 gap-1.5"
              onClick={() =>
                openLaura(
                  t('askLaura', { name, network: conversation.network ?? 'Beeper', chatId: conversation.chatId }),
                )
              }
            >
              <Sparkles aria-hidden className="size-4" />
              {t('prepareWithLaura')}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="min-h-11 gap-1.5"
            disabled={!text.trim() || send.isPending || Boolean(send.data)}
            onClick={submit}
          >
            <Send aria-hidden className="size-4" />
            {t('send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
