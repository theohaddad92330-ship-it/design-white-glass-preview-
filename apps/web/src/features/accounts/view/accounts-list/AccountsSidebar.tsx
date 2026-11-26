import { Button, Card, Text } from '@bellum/ui'
import { Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatShortDate } from '@bellum/utils'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { SimilarAccountContainer } from './SimilarAccountContainer'
import type { AccountRow } from './types'

type AccountsSidebarProps = {
  accounts: AccountRow[]
  showRecentAccounts?: boolean
  onViewHistory: () => void
}

export function AccountsSidebar({ accounts, showRecentAccounts = true, onViewHistory }: AccountsSidebarProps) {
  const recentAccounts = [...accounts]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  // #1316.5 — plus de défilement PROPRE à ce panneau. Deux ascenseurs verticaux
  // imbriqués sur le même écran est la cause racine déjà payée ici le 02/09 :
  // le contenu se déroule dans la page, qui en a un.
  return (
    <div className="flex w-72 flex-col gap-3 p-1">
      <SimilarAccountContainer />

      {showRecentAccounts ? (
        <RecentAccountListItem recentAccounts={recentAccounts} onViewHistory={onViewHistory} />
      ) : null}
    </div>
  )
}

type RecentAccountListItemProps = {
  recentAccounts: AccountRow[]
  onViewHistory: () => void
}

const RecentAccountListItem = ({ recentAccounts, onViewHistory }: RecentAccountListItemProps) => {
  const { t } = useTranslation('accounts')
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Clock className="size-3.5 " />
        <Text size="sm" weight="semibold">
          {t('sidebar.recentHistory')}
        </Text>
      </div>
      {recentAccounts.length === 0 ? (
        <Text size="xs">{t('sidebar.noAccounts')}</Text>
      ) : (
        <ul className="divide-y divide-[var(--bellum-border)]">
          {recentAccounts.map(a => (
            <li key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <CompanyAvatar name={a.company_name} size="md" logoUrl={a.logo_url} website={a.website} />
              <div className="min-w-0 flex-1">
                <Text size="xs" weight="medium" noWrap className="truncate text-[var(--bellum-text-primary)]">
                  {a.company_name}
                </Text>
              </div>
              <Text size="xs" className="shrink-0 text-[var(--bellum-text-muted)] tabular-nums">
                {formatShortDate(new Date(a.created_at))}
              </Text>
            </li>
          ))}
        </ul>
      )}
      {recentAccounts.length > 0 && (
        <Button type="button" variant="ghost" size="sm" onClick={onViewHistory} className="mt-3">
          {t('sidebar.viewAllHistory')}
        </Button>
      )}
    </Card>
  )
}
