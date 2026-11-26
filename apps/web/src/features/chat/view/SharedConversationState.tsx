import { useTranslation } from 'react-i18next'
import { Users } from 'lucide-react'
import { Text } from '@bellum/ui'
import type { ChatMessageAuthor } from '@/features/chat/api/agentChatApi'
import { useSelfChatAuthor } from '@/features/chat/hooks/useSelfChatAuthor'
import { sharedConversationAuthors } from '@/features/chat/lib/shared-conversation'

/**
 * #1910.8 — « Partagée avec … », à côté de la portée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI À CÔTÉ DE LA PORTÉE, ET PAS AILLEURS
 * ─────────────────────────────────────────────────────────────────────────────
 * La portée dit CE QUE Laura lit ; elle ne dit pas AVEC QUI on lui parle. Un fil
 * où un collègue a posé trois questions ne s'écrit pas comme un fil à soi — on y
 * répond, on n'y recommence pas. Les deux informations répondent à la même
 * question de cadre, donc elles se lisent d'un seul regard.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL N'APPARAÎT QUE MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Une CONVERSATION NOMMÉE est team-scopée côté serveur, donc partageABLE : une
 * pastille posée sur tous les fils ne distinguerait rien et cesserait d'être lue
 * en deux jours. `sharedConversationAuthors` rend `null` dès qu'on ne peut pas
 * PROUVER qu'un collègue a écrit — et `null` ne rend rien du tout, pas une
 * pastille vide.
 *
 * ⚠️ #2703 (22/09/2026) — le fil PAR DÉFAUT n'est plus partagé du tout : il
 * appartient à son auteur côté serveur. Rien à changer ici, et c'est le signe
 * que la pastille était juste : elle se dérive des messages RENDUS, jamais d'une
 * hypothèse sur la portée. Un fil par défaut ne porte plus que les miens, donc
 * `sharedConversationAuthors` y rend `null` et aucune pastille n'apparaît —
 * exactement ce qu'il faut dire d'un brouillon personnel.
 *
 * `shrink-0` : sur la ligne de l'en-tête, c'est la portée — le seul libellé
 * long — qui cède la place (#1994), jamais cette mention.
 */
export function SharedConversationState({
  messages,
}: {
  messages: readonly { role: 'user' | 'assistant'; author?: ChatMessageAuthor | null }[]
}) {
  const { t } = useTranslation('chat')
  const self = useSelfChatAuthor()
  const others = sharedConversationAuthors(messages, self)
  if (!others) return null
  const names = others.join(', ')
  return (
    <span
      className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--bellum-surface-2)] px-2 py-0.5"
      title={t('scope.shared.title', { names })}
    >
      <Users className="size-3 text-[var(--bellum-text-muted)]" aria-hidden />
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {t('scope.shared.label', { count: others.length, names })}
      </Text>
    </span>
  )
}
