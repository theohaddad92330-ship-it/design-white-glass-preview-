import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { AccountRow } from './types'

interface CompareBestBannerProps {
  accounts: AccountRow[]
}

export function CompareBestBanner({ accounts }: CompareBestBannerProps) {
  const { t } = useTranslation('accounts')
  const best = accounts.reduce<AccountRow | null>((acc, a) => {
    if (acc == null) return a
    return (a.priority_score ?? -1) > (acc.priority_score ?? -1) ? a : acc
  }, null)
  if (!best) return null

  return (
    <div className="mt-5 rounded-lg px-4 py-3 flex items-center gap-2 bg-violet-500/[0.08] border border-violet-500/[0.18]">
      <Text element="span" size="xs" className="text-[var(--text-ghost)]">
        {t('compare.bestOpportunity')}
      </Text>
      <Text element="span" size="sm" weight="semibold" className="text-[var(--bellum-text-accent)]">
        {best.company_name}
      </Text>
      {best.priority_score != null && (
        <Text element="span" size="xs" className="text-[var(--text-muted)]">
          {t('compare.scoreSuffix', { score: best.priority_score })}
        </Text>
      )}
    </div>
  )
}
