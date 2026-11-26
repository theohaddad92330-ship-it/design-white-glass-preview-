import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { useAlreadyProposed } from '../hooks'

/**
 * #4158.23 — « consultant déjà proposé » : sur une opportunité, quand on s'apprête à
 * proposer des consultants qu'un collègue a déjà proposés à ce client ou sur un
 * autre besoin ouvert — qui, quel client, quelle date. Information, jamais un
 * blocage. Rien du tout si personne ne les a proposés.
 */
export function AlreadyProposedNote({
  projectId,
  consultantIds,
}: {
  projectId: string | null
  consultantIds: readonly string[]
}) {
  const { t } = useTranslation('teamGuardrails')
  const { data } = useAlreadyProposed(projectId, consultantIds)
  const items = data?.items ?? []
  if (items.length === 0) return null

  return (
    <section aria-label={t('alreadyProposed.info')} className="space-y-1">
      <ul className="space-y-1">
        {items.map(item => {
          const date = formatDate(item.at) ?? ''
          const sentence =
            item.relation === 'client'
              ? item.account_name
                ? t('alreadyProposed.client', { name: item.by_name, client: item.account_name, date })
                : t('alreadyProposed.clientNoName', { name: item.by_name, date })
              : item.account_name
                ? t('alreadyProposed.need', {
                    name: item.by_name,
                    role: item.need_role,
                    client: item.account_name,
                    date,
                  })
                : t('alreadyProposed.needNoClient', { name: item.by_name, role: item.need_role, date })
          return (
            <li key={item.consultant_id}>
              <Text size="sm" color="text-[var(--warning-soft-text)]">
                {sentence}
              </Text>
            </li>
          )
        })}
      </ul>
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('alreadyProposed.info')}
      </Text>
    </section>
  )
}
