import { useEffect, useState } from 'react'
import { Badge, Button, SettingsRow, Spinner } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/features/auth/api'
import { TwoFactorDisableDialog } from './TwoFactorDisableDialog'
import { TwoFactorEnrollDialog } from './TwoFactorEnrollDialog'

type DialogState = 'none' | 'enroll' | 'disable'

/** Rangée 2FA — reflète `GET /auth/2fa/status` et pilote l'enrôlement TOTP réel
 *  (QR + vérification) ainsi que la désactivation (code requis). */
export function TwoFactorRow() {
  const { t } = useTranslation('settings', { keyPrefix: 'security' })
  // `null` while the status probe is in flight.
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [dialog, setDialog] = useState<DialogState>('none')

  useEffect(() => {
    let cancelled = false
    authApi
      .mfaStatus()
      .then(status => {
        if (!cancelled) setEnabled(status.enabled)
      })
      .catch(() => {
        if (!cancelled) setEnabled(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <SettingsRow
        title={t('twoFactorTitle')}
        description={t('twoFactorDescription')}
        badge={enabled ? <Badge variant="success">{t('twoFactorEnabledBadge')}</Badge> : undefined}
        trailing={
          enabled === null ? (
            <Spinner />
          ) : enabled ? (
            <Button variant="outline" size="sm" onClick={() => setDialog('disable')}>
              {t('twoFactorDisableButton')}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setDialog('enroll')}>
              {t('twoFactorEnableButton')}
            </Button>
          )
        }
      />

      <TwoFactorEnrollDialog
        open={dialog === 'enroll'}
        onOpenChange={next => setDialog(next ? 'enroll' : 'none')}
        onEnabled={() => {
          setEnabled(true)
          setDialog('none')
        }}
      />
      <TwoFactorDisableDialog
        open={dialog === 'disable'}
        onOpenChange={next => setDialog(next ? 'disable' : 'none')}
        onDisabled={() => {
          setEnabled(false)
          setDialog('none')
        }}
      />
    </>
  )
}
