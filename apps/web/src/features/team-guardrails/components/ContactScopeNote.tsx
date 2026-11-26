import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { useAccountTeam } from '../hooks'

/**
 * #4996 L6 — « Dans la zone de X » : une mention NON bloquante sur un contact dont l'entité est couverte par un
 * collègue (même patron que `ColleagueActivityBanner`). Information seulement : aucun refus, aucune confirmation.
 * Rien pour un contact sans entité, pour une zone en texte libre (ne rapproche pas de noms), ni pour soi-même.
 */
export function ContactScopeNote({ accountId, entityId }: { accountId: string; entityId: string | null | undefined }) {
  const { t } = useTranslation('teamGuardrails')
  const { data } = useAccountTeam(accountId)
  const selfId = useWorkspaceMembers().data?.find(m => m.isSelf)?.userId
  if (!data || !entityId) return null
  const people = [...(data.responsible ? [data.responsible] : []), ...data.members]
  const names = people
    .filter(p => p.user_id !== selfId && (p.scopes ?? []).some(scope => scope.entity_id === entityId))
    .map(p => p.name)
  if (names.length === 0) return null
  return (
    <Text size="sm" color="text-[var(--bellum-text-secondary)]">
      {t('scopeNote', { names: names.join(', ') })}
    </Text>
  )
}
