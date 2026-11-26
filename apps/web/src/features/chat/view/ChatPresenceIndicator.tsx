import { useTranslation } from 'react-i18next'
import { Text } from '@bellum/ui'
import type { ChatPresenceMember } from '@bellum/contracts'

/**
 * #5047 — la mesure (`useChatPresence`) est lue UNE fois, par `ConversationHeaderMenu` : le ⋯ la dit, ce
 * composant la nomme dans le menu. Deux lectures = deux battements de présence (GA-26).
 *
 * #3086 — « afficher si une personne est sur une conversation » (Apricot
 * Labs, deux sièges, un même espace, call bêta du 24/09/2026).
 *
 * Même patron que `SharedConversationState` juste à côté (#1910.8) : IL
 * N'APPARAÎT QUE MESURÉ. Sans autre membre actif, `useChatPresence` rend `[]`
 * et ce composant ne rend RIEN — pas une pastille vide (doctrine « on
 * n'affiche pas ce qu'on n'a pas », GA-18/GA-19).
 */
export function ChatPresenceIndicator({ members }: { members: readonly ChatPresenceMember[] }) {
  const { t } = useTranslation('chat')
  if (members.length === 0) return null
  const names = members.map(member => member.firstName).join(', ')
  return (
    <span
      className="flex min-w-0 items-center gap-1 rounded-full bg-[var(--bellum-surface-2)] px-2 py-0.5"
      title={t('presence.title', { names })}
    >
      <span className="size-2 shrink-0 rounded-full bg-[var(--bellum-success)]" aria-hidden />
      <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="truncate">
        {t('presence.label', { count: members.length, names })}
      </Text>
    </span>
  )
}
