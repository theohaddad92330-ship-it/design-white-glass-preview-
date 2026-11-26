import { i18n } from '@/i18n'

export function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return i18n.t('accounts:timeAgo.lessThanHour')
  if (hours < 24) return i18n.t('accounts:timeAgo.hoursAgo', { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 30) return i18n.t('accounts:timeAgo.daysAgo', { count: days })
  return i18n.t('accounts:timeAgo.monthsAgo', { count: Math.floor(days / 30) })
}

export function formatRelative(date: Date): string {
  const diff = Date.now() - date.getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 10) return i18n.t('accounts:timeAgo.justNow')
  if (secs < 60) return i18n.t('accounts:timeAgo.secondsAgo', { count: secs })
  const mins = Math.floor(secs / 60)
  if (mins < 60) return i18n.t('accounts:timeAgo.minutesAgo', { count: mins })
  return i18n.t('accounts:timeAgo.hoursAgo', { count: Math.floor(mins / 60) })
}
