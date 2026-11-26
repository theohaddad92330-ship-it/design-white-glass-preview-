import { useId, useState, type FormEvent } from 'react'
import { Badge, Button, Input, SettingsRow, Switch, Text } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { SMS_NOTIFICATION_TYPES, smsPhoneNumberSchema, type SmsNotificationType } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@/lib/api'
import { useSmsChannel } from '@/features/notifications/hooks/useSmsChannel'

/** Ce que l'écran dit d'un refus du serveur — jamais la phrase brute, qui
 *  resterait en français sous une interface anglaise. */
function errorKeyFor(error: unknown, gesture: 'phone' | 'code' | 'types' | 'withdraw'): string {
  if (!(error instanceof ApiError)) return 'errors.generic'
  if (error.status === 429) return 'errors.cooldown'
  if (error.status === 409) return 'errors.needVerification'
  if (error.status === 403 || error.status === 503) return 'errors.unavailable'
  if (error.status === 400 && gesture === 'code') return 'errors.code'
  if (error.status === 400 && gesture === 'phone') return 'errors.invalidPhone'
  return 'errors.generic'
}

/**
 * LE CANAL SMS DES ALERTES URGENTES — #1938.4, décision Louis 13/09 batch 13.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VISIBLE, ET INACTIVE TANT QU'AUCUN FOURNISSEUR N'EST BRANCHÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Le serveur dit ce que le canal PEUT faire (`status`) ; l'écran ne le devine
 * jamais. Hors de `ready`, rien ne se saisit et rien ne se coche — sauf DÉCOCHER
 * une alerte déjà cochée et RETIRER son numéro, qui ne dépendent jamais d'un
 * fournisseur ni d'un interrupteur.
 *
 * Le consentement a trois marches, et l'écran les montre dans l'ordre : un
 * numéro saisi, un code reçu et saisi, puis une alerte cochée — une par une,
 * aucune par défaut. Seules les alertes URGENTES sont proposées : celles que
 * garde la présélection « Urgent uniquement ».
 */
export function SmsChannelSection({ bare = false }: { bare?: boolean } = {}) {
  const { t } = useTranslation('settings', { keyPrefix: 'notifications.sms' })
  const { settings, isLoading, isError, startVerification, confirmVerification, updateTypes, withdraw } =
    useSmsChannel()
  const phoneId = useId()
  const codeId = useId()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [errorKey, setErrorKey] = useState<string | null>(null)

  const status = settings?.status
  const ready = status === 'ready'
  const verified = Boolean(settings?.verified_at)
  const pending = ready && !verified && Boolean(settings?.verification_pending)
  const busy = startVerification.isPending || confirmVerification.isPending || updateTypes.isPending

  function submitPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = smsPhoneNumberSchema.safeParse(phone.replace(/[\s.()-]/g, ''))
    if (!parsed.success) {
      setErrorKey('errors.invalidPhone')
      return
    }
    setErrorKey(null)
    startVerification.mutate(parsed.data, { onError: error => setErrorKey(errorKeyFor(error, 'phone')) })
  }

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorKey(null)
    confirmVerification.mutate(code.trim(), {
      onSuccess: () => setCode(''),
      onError: error => setErrorKey(errorKeyFor(error, 'code')),
    })
  }

  function toggle(type: SmsNotificationType, next: boolean) {
    setErrorKey(null)
    updateTypes.mutate({ [type]: next }, { onError: error => setErrorKey(errorKeyFor(error, 'types')) })
  }

  return (
    <SettingsBlock label={t('groupLabel')} bare={bare}>
      <SettingsRow
        title={t('title')}
        description={t('description')}
        badge={
          status && status !== 'ready' ? (
            <Badge variant="outline" className="text-xs">
              {t(`statusBadge.${status}`)}
            </Badge>
          ) : undefined
        }
      />

      {isError && (
        <div className="border-b border-[var(--bellum-border)] px-4 py-3 last:border-b-0">
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('loadError')}
          </Text>
        </div>
      )}

      {!isLoading && settings && (
        <>
          {status !== 'ready' && (
            <div className="border-b border-[var(--bellum-border)] px-4 py-3">
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t(`statusDetail.${status}`)}
              </Text>
            </div>
          )}

          <div className="space-y-2 border-b border-[var(--bellum-border)] px-4 py-4">
            {verified ? (
              <Text size="sm" className="text-[var(--bellum-text-primary)]">
                {t('verifiedAs', { phone: settings.phone ?? '' })}
              </Text>
            ) : pending ? (
              <form onSubmit={submitCode} className="space-y-2">
                <label htmlFor={codeId} className="block text-sm font-medium text-[var(--bellum-text-primary)]">
                  {t('codeLabel')}
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id={codeId}
                    value={code}
                    onChange={event => setCode(event.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    className="max-w-40 pointer-coarse:min-h-11"
                  />
                  <Button type="submit" size="sm" disabled={busy || code.trim().length !== 6}>
                    {t('confirmCode')}
                  </Button>
                </div>
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {t('codeSentTo', { phone: settings.phone ?? '' })}
                </Text>
              </form>
            ) : (
              <form onSubmit={submitPhone} className="space-y-2">
                <label htmlFor={phoneId} className="block text-sm font-medium text-[var(--bellum-text-primary)]">
                  {t('phoneLabel')}
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id={phoneId}
                    type="tel"
                    value={phone}
                    onChange={event => setPhone(event.target.value)}
                    placeholder={t('phonePlaceholder')}
                    autoComplete="tel"
                    disabled={!ready}
                    className="max-w-64 pointer-coarse:min-h-11"
                  />
                  <Button type="submit" size="sm" disabled={!ready || busy}>
                    {t('sendCode')}
                  </Button>
                </div>
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {t('phoneHint')}
                </Text>
              </form>
            )}
            {errorKey && (
              <Text size="xs" role="alert" className="text-[var(--danger-soft-text)]">
                {t(errorKey)}
              </Text>
            )}
          </div>

          {!verified && (
            <div className="border-b border-[var(--bellum-border)] px-4 py-3">
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('typesNeedVerification')}
              </Text>
            </div>
          )}

          {SMS_NOTIFICATION_TYPES.filter(type => type !== 'credit_low').map(type => {
            const checked = settings.types[type]
            return (
              <SettingsRow
                key={type}
                title={t(`types.${type}`)}
                trailing={
                  <Switch
                    aria-label={t(`types.${type}`)}
                    checked={checked}
                    // Décocher toujours ; cocher seulement un numéro vérifié,
                    // sur un canal prêt.
                    disabled={checked ? updateTypes.isPending : !(ready && verified) || updateTypes.isPending}
                    onCheckedChange={next => toggle(type, next)}
                  />
                }
              />
            )
          })}

          {settings.phone && (
            <SettingsRow
              title={t('withdrawTitle')}
              description={t('withdrawDescription')}
              trailing={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={withdraw.isPending}
                  onClick={() => {
                    setErrorKey(null)
                    withdraw.mutate(undefined, { onError: error => setErrorKey(errorKeyFor(error, 'withdraw')) })
                  }}
                >
                  {t('withdrawAction')}
                </Button>
              }
            />
          )}
        </>
      )}
    </SettingsBlock>
  )
}
