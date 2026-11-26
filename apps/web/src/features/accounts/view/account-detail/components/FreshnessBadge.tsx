import { Calendar } from 'lucide-react'
import { cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

export function FreshnessBadge({ dateStr }: { dateStr: string | null }) {
  const { t, i18n } = useTranslation('accounts')
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor(diff / 3600000)

  let label = ''
  let color = ''
  if (hours < 1) {
    label = t('freshness.lessThanHour')
    color = 'text-[var(--success-soft-text)]'
  } else if (hours < 24) {
    label = t('freshness.hoursAgo', { count: hours })
    color = 'text-[var(--success-soft-text)]'
  } else if (days < 7) {
    label = t('freshness.daysAgo', { count: days })
    color = 'text-[var(--success-soft-text)]'
  } else if (days < 30) {
    label = t('freshness.daysAgo', { count: days })
    color = 'text-[var(--warning-soft-text)]'
  } else {
    label = t('freshness.monthsAgo', { count: Math.floor(days / 30) })
    color = 'text-[var(--danger-soft-text)]'
  }

  const formatted = new Date(dateStr).toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <span className={cn('hidden md:flex items-center gap-1 text-xs', color)}>
      <Calendar className="h-3 w-3" />
      {t('freshness.analyzedOn', { date: formatted, label })}
    </span>
  )
}
