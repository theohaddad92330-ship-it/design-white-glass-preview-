'use client'

import { useTranslations } from 'next-intl'
import { openCookieSettings } from './cookieSettingsStore'

export function CookieSettingsLink({ className }: { className?: string }) {
  const t = useTranslations('common.cookie')
  return (
    <button type="button" onClick={openCookieSettings} className={className}>
      {t('settingsLink')}
    </button>
  )
}
