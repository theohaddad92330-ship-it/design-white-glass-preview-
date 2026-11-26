'use client'

import { Button, Card, Separator, Switch, Text, cn, type ButtonProps } from '@bellum/ui'
import { useTranslations } from 'next-intl'
import { useCallback, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  ACCEPT_ALL_CONSENT,
  REJECT_ALL_CONSENT,
  getCookieConsent,
  migrateLegacyCookieConsent,
  saveCookieConsent,
  type CookieConsent,
} from '@bellum/consent'
import {
  closeCookieSettings,
  getCookieSettingsOpen,
  getCookieSettingsServerSnapshot,
  openCookieSettings,
  subscribeCookieSettings,
} from './cookieSettingsStore'

type CookieContentCardProps = {
  className?: string
}

const PILL = 'w-full rounded-full px-3 sm:w-auto'
const PRIMARY_GLOW = 'shadow-[0_0_30px_rgba(124,58,237,0.45)]'

type CookieAction = {
  label: string
  variant: ButtonProps['variant']
  onClick: () => void
  className?: string
}

export function CookieContentCard({ className }: CookieContentCardProps) {
  const t = useTranslations('common.cookie')
  const visible = useSyncExternalStore(subscribeCookieSettings, getCookieSettingsOpen, getCookieSettingsServerSnapshot)
  const [customizing, setCustomizing] = useState(false)
  const [analytics, setAnalytics] = useState(() => getCookieConsent()?.analytics ?? false)

  useLayoutEffect(() => {
    // Un visiteur qui a déjà répondu dans l'ancien stockage n'est pas
    // re-sollicité — y compris s'il avait REFUSÉ.
    migrateLegacyCookieConsent()
    const consent = getCookieConsent()
    if (consent === null) {
      openCookieSettings()
      return
    }
    setAnalytics(consent.analytics)
  }, [])

  const persist = useCallback((consent: CookieConsent) => {
    saveCookieConsent(consent)
    closeCookieSettings()
  }, [])

  const actions: CookieAction[] = useMemo(
    () => [
      { label: t('acceptAll'), variant: 'violet', onClick: () => persist(ACCEPT_ALL_CONSENT), className: PRIMARY_GLOW },
      { label: t('rejectAll'), variant: 'outline', onClick: () => persist(REJECT_ALL_CONSENT) },
      { label: t('customize'), variant: 'outline', onClick: () => setCustomizing(true) },
    ],
    [persist, t],
  )

  if (!visible) return null

  return (
    <Card aria-label={t('manageAria')} className={cn('rounded-3xl p-6', className)}>
      <Text element="h3" size="base" weight="semibold" color="text-foreground">
        {t('title')}
      </Text>
      <Text leading="normal" color="text-muted-foreground" size="sm" className="mt-1 max-w-2xl">
        {t('description')}
      </Text>

      {customizing ? (
        <CustomizeCookieContentCard
          analytics={analytics}
          setAnalytics={setAnalytics}
          persist={persist}
          setCustomizing={setCustomizing}
        />
      ) : (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {actions.map(action => (
            <Button
              key={action.label}
              variant={action.variant}
              size="lg"
              onClick={action.onClick}
              className={cn(PILL, action.className)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </Card>
  )
}

type CustomizeCookieContentCardProps = {
  analytics: boolean
  setAnalytics: (value: boolean) => void
  persist: (consent: CookieConsent) => void
  setCustomizing: (value: boolean) => void
}

const CustomizeCookieContentCard = ({
  analytics,
  setAnalytics,
  persist,
  setCustomizing,
}: CustomizeCookieContentCardProps) => {
  const t = useTranslations('common.cookie')
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Text weight="medium" size="sm" color="text-foreground">
            {t('analyticsTitle')}
          </Text>
          <Text size="xs" color="text-muted-foreground">
            {t('analyticsDescription')}
          </Text>
        </div>
        <Switch checked={analytics} onCheckedChange={setAnalytics} aria-label={t('analyticsAria')} />
      </div>

      <Separator className="my-6" />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button
          variant="violet"
          size="lg"
          className={cn(PILL, PRIMARY_GLOW)}
          onClick={() => persist({ necessary: true, analytics })}
        >
          {t('save')}
        </Button>
        <Button variant="outline" size="lg" className={PILL} onClick={() => setCustomizing(false)}>
          {t('back')}
        </Button>
      </div>
    </div>
  )
}
