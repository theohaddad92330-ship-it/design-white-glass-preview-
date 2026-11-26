import { useTranslation } from 'react-i18next'
import { Badge, Text } from '@bellum/ui'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'

/**
 * #1940.3 — « Voir les participants » : qui a accès au fil ouvert.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE PANNEAU DIT, ET POURQUOI CE N'EST PAS UNE LISTE CHOISIE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le fil du copilote est team-scopé, pas nominatif : `GET /ia/chat/messages`
 * résout l'espace de l'appelant et rend le fil de cet espace « sans regarder
 * qui l'a écrit » (voir `ShareConversation.tsx`). Il n'existe donc PAS de
 * mécanisme d'accès sélectif par personne à un fil précis — un panneau qui
 * ferait semblant du contraire (« Alice a accès, Bob non ») inventerait un
 * droit qui n'existe pas. Ce panneau dit la chose VRAIE : tout le monde dans
 * l'espace peut lire ce fil, et liste QUI ça désigne concrètement
 * (`useWorkspaceMembers`, le même registre que le sélecteur « assigner à »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE `useQuery` EST DANS UN COMPOSANT À PART
 * ─────────────────────────────────────────────────────────────────────────────
 * Même raison que `ConversationSummaryPanel` juste à côté : ce déclencheur est
 * monté sur TOUT `/chat` (`ChatHeader`). `ParticipantsContent` n'est construit
 * qu'après un premier clic, pour que les tests qui montent `<Chat />` sans
 * `QueryClientProvider` — et n'ouvrent jamais ce popover — n'appellent jamais
 * `useQueryClient()`.
 */
export function ParticipantsContent() {
  const { t } = useTranslation('chat')
  const { data, isLoading, isError } = useWorkspaceMembers()

  if (isLoading) {
    return (
      <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('participants.loading')}
      </Text>
    )
  }

  if (isError) {
    return (
      <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('participants.loadFailed')}
      </Text>
    )
  }

  const members = data ?? []
  if (members.length === 0) {
    return (
      <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('participants.empty')}
      </Text>
    )
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {members.map(member => (
        <li key={member.userId} className="flex items-center justify-between gap-2">
          <Text element="span" size="sm" className="truncate">
            {member.fullName || member.email || t('participants.unknown')}
          </Text>
          {member.isSelf && (
            <Badge variant="outline" className="shrink-0 text-xs">
              {t('participants.you')}
            </Badge>
          )}
        </li>
      ))}
    </ul>
  )
}
