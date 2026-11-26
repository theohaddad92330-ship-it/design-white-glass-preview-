import { useTranslation } from 'react-i18next'
import { MoreHorizontal } from 'lucide-react'
import { Button, Popover, PopoverContent, PopoverTrigger } from '@bellum/ui'
import { useChatPresence } from '@/features/chat/hooks/useChatPresence'
import { ChatPresenceIndicator } from './ChatPresenceIndicator'
import { ConversationMenu } from './ConversationMenu'
import { ExportConversation } from './ExportConversation'
import { ShareConversation } from './ShareConversation'

/**
 * #5047 (épopée #5033.7) — le menu ⋯ de l'en-tête de /chat, forme de la maquette V8 (`laura-conversation`) :
 * l'en-tête garde l'identité, mention « Assistante IA » (art. 50) et portée ; tout le reste se range ici.
 *
 * Forme de la maquette, FONCTION gardée : rien n'est réécrit, les trois entrées sont les composants
 * d'avant (`ConversationMenu`, `ShareConversation`, `ExportConversation`), montés comme lignes. Aucun
 * accès, transfert, rattachement, version ni partage n'est perdu (GA-26 : un geste, un seul endroit).
 *
 * PRÉSENCE : un indicateur « qui est là » rangé dans un menu n'est plus vu. Quand un collègue est MESURÉ,
 * le ⋯ porte une pastille et son nom accessible le dit ; le menu nomme la personne en tête. Sans mesure,
 * rien (GA-18/19 : on n'affiche pas ce qu'on n'a pas).
 */
export function ConversationHeaderMenu({
  accountId,
  conversationId,
  hasExchange,
  sources,
  mailboxRead,
  hasRestrictedSource,
}: {
  accountId: string | null
  conversationId: string | null
  hasExchange: boolean
  sources: readonly { kind: string; label: string; replies: number }[]
  /** #5032.9 — Laura a lu un fil de la messagerie de ce lecteur dans ce fil. */
  mailboxRead?: boolean
  hasRestrictedSource: boolean
}) {
  const { t } = useTranslation('chat')
  const members = useChatPresence(accountId, conversationId)
  const names = members.map(member => member.firstName).join(', ')
  const label = t('headerMenu.action')
  const present = members.length > 0

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          icon={MoreHorizontal}
          className="relative pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          aria-label={present ? `${label} — ${t('presence.label', { count: members.length, names })}` : label}
        >
          {present ? (
            <span
              className="absolute right-1 top-1 size-2 rounded-full bg-[var(--bellum-success)]"
              aria-hidden
              data-presence-dot
            />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-1 p-1" aria-label={label}>
        <ChatPresenceIndicator members={members} />
        <ConversationMenu
          accountId={accountId}
          conversationId={conversationId}
          hasExchange={hasExchange}
          sources={sources}
          mailboxRead={mailboxRead}
        />
        <ShareConversation
          accountId={accountId}
          conversationId={conversationId}
          hasRestrictedSource={hasRestrictedSource}
        />
        {/* #3979.1 — exporter CE fil (Markdown, PDF). */}
        <ExportConversation accountId={accountId} conversationId={conversationId} />
      </PopoverContent>
    </Popover>
  )
}
