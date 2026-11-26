import { Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Network } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ObjectMention } from '@/components/primitives/ObjectMention'
import { accountKeys, accountsApi, type GroupEntity } from '@/features/accounts/api'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { EntityCoverage } from '@/features/team-guardrails/components/EntityCoverage'

/**
 * #4158.60 / .61 / .62 (EX-03, arbitrage Louis 15/10/2026) — « une fiche par entité ».
 *
 * Chaque entité d'un groupe (Orange Business, Orange France…) est un COMPTE à part, avec
 * son responsable, ses notes et ses actions. Cette carte NOMME les autres entités du même
 * groupe et ce que chacune porte — jamais le total du groupe : les notes et les actions
 * restent attachées à l'entité.
 *
 * Elle ne donne aucun droit. L'API ne renvoie que les entités du périmètre BU du lecteur
 * (`account-group-entities.ts`) : une entité hors périmètre n'apparaît ni par son nom ni par
 * ses compteurs. Être responsable d'une entité n'ouvre rien sur les autres.
 *
 * Rien tant que la réponse n'est pas là, rien quand il n'y a pas d'autre entité visible :
 * une absence ne fait aucune ligne.
 */
export function GroupEntitiesCard({ accountId }: { accountId: string }) {
  const { t } = useTranslation('accounts', { keyPrefix: 'groupEntities' })
  const { data } = useQuery({
    queryKey: accountKeys.groupEntities(accountId),
    queryFn: () => accountsApi.groupEntities(accountId),
  })
  const members = useWorkspaceMembers().data ?? []
  if (!data || data.length === 0) return null

  const ownerName = (entity: GroupEntity): string | null => {
    if (!entity.ownerUserId) return null
    const member = members.find(m => m.userId === entity.ownerUserId)
    return member?.fullName ?? member?.email ?? null
  }

  return (
    <section
      aria-label={t('title')}
      className="min-w-0 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <Network className="h-4 w-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
        <Text element="h3" size="sm" weight="medium">
          {t('title')}
        </Text>
      </div>
      <ul className="mt-2 space-y-2">
        {data.map(entity => {
          const owner = ownerName(entity)
          return (
            <li key={entity.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <ObjectMention
                kind="account"
                id={entity.id}
                name={entity.companyName}
                attribute={entity.role ? t(entity.role === 'groupe' ? 'roleGroupe' : 'roleFiliale') : undefined}
              />
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {owner ? t('owner', { name: owner }) : t('noOwner')} · {t('actions', { count: entity.openActions })} ·{' '}
                {t('notes', { count: entity.notes })}
              </Text>
            </li>
          )
        })}
      </ul>
      <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-2">
        {t('note')}
      </Text>
      {/* #4996 L6 — qui couvre chaque entité du compte (rien si personne). */}
      <EntityCoverage accountId={accountId} />
    </section>
  )
}
