import { Badge, Box, Button, Text } from '@bellum/ui'
import type { ContentVisibility } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'

/**
 * #4158.30 — ce qu'un contenu d'équipe (modèle, séquence) dit de lui-même : partagé avec l'équipe ou
 * personnel, qui l'a écrit, quand il a bougé. L'auteur — et lui seul — peut le partager ou le reprendre.
 *
 * Un auteur inconnu (modèle antérieur à la notion) ne fait AUCUNE ligne « par … » : on n'invente pas de
 * propriétaire. La date est celle de la dernière mise à jour, à défaut celle de la création.
 */
export function SharedContentMeta({
  visibility,
  createdBy,
  updatedAt,
  createdAt,
  onSetVisibility,
  pending,
}: {
  visibility: ContentVisibility
  createdBy: string | null
  updatedAt: string | null
  createdAt: string
  onSetVisibility: (next: ContentVisibility) => void
  pending: boolean
}) {
  const { t, i18n } = useTranslation('outreach')
  const members = useWorkspaceMembers().data ?? []
  const author = createdBy ? members.find(member => member.userId === createdBy) : undefined
  const authorName = author?.fullName ?? author?.email ?? null
  const mine = !!author?.isSelf
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  const date = new Date(updatedAt ?? createdAt).toLocaleDateString(locale)
  const next: ContentVisibility = visibility === 'team' ? 'personal' : 'team'

  return (
    <Box className="flex flex-wrap items-center gap-2" data-testid="shared-content-meta">
      <Badge>{visibility === 'team' ? t('library.shared.team') : t('library.shared.personal')}</Badge>
      {authorName ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('library.shared.by', { name: authorName })}
        </Text>
      ) : null}
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('library.shared.updatedOn', { date })}
      </Text>
      {mine ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => onSetVisibility(next)}>
          {visibility === 'team' ? t('library.shared.makePersonal') : t('library.shared.share')}
        </Button>
      ) : null}
    </Box>
  )
}
