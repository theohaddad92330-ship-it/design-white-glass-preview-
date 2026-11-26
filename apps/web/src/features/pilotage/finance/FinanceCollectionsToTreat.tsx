import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { formatCents } from '@/lib/money'
import type { collectionsToTreatByClient } from './finance-collections-clients'

type ByClient = ReturnType<typeof collectionsToTreatByClient>

/**
 * Les lignes À TRAITER (en retard ou en attente), GROUPÉES PAR CLIENT. Chaque
 * client ouvre `/missions/encaissements?client=<nom>` — la liste se resserre sur
 * lui. Aucun « partiellement réglée » : le reste dû se nomme sur les deux
 * statuts qui existent.
 */
export function FinanceCollectionsToTreat({ data }: { data: ByClient }) {
  const { t } = useTranslation(['pilotage', 'missions'])
  if (data.groups.length === 0 && data.withoutClient === 0) return null
  return (
    <div className="mt-4">
      <Text size="xs" weight="semibold" className="block text-[var(--bellum-text-secondary)]">
        {t('finance.collections.toTreat.title')}
      </Text>
      <ul className="mt-1 flex flex-col">
        {data.groups.map(group => (
          <li key={group.client} className="border-b border-border last:border-b-0">
            <Link
              to="/missions/encaissements"
              search={{ client: group.client }}
              className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-[var(--bellum-text-primary)] hover:bg-[var(--bellum-surface-2)]"
            >
              <span className="min-w-0">
                <Text size="sm" weight="medium" className="block">
                  {group.client}
                </Text>
                <Text size="xs" className="block text-[var(--bellum-text-muted)]">
                  {t('finance.collections.toTreat.lines', { count: group.count })}
                  {group.overdue > 0 ? ` · ${t('finance.collections.toTreat.overdue', { count: group.overdue })}` : ''}
                  {group.oldestOverdueDays !== null
                    ? ` · ${t('finance.collections.toTreat.oldest', { count: group.oldestOverdueDays })}`
                    : ''}
                </Text>
              </span>
              {group.amountCents === null ? (
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('finance.collections.toTreat.amountUnknown')}
                </Text>
              ) : (
                <Text size="sm" weight="semibold">
                  {formatCents(group.amountCents)}
                </Text>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {data.withoutClient > 0 ? (
        <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
          {t('finance.collections.toTreat.withoutClient', { count: data.withoutClient })}
        </Text>
      ) : null}
    </div>
  )
}
