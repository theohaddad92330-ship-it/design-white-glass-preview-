import type { Contact, LinkedInSendView } from '@bellum/contracts'
import { Button } from '@bellum/ui'
import type { TFunction } from 'i18next'
import { Send, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  useGrantLinkedinMandate,
  useLinkedinSendStatus,
  useRevokeLinkedinMandate,
  useSendLinkedinMessage,
} from '@/features/linkedin/send'

/** La durée du mandat que le bouton propose : trente jours, le plafond des mandats d'envoi. */
const MANDATE_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

function formatDay(iso: string, locale: string): string {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleDateString(locale, { day: '2-digit', month: 'short' })
}

/**
 * #4737 K2 — LE MANDAT D'ENVOI LINKEDIN, vu depuis la préparation du message.
 *
 * Le copilote prépare, le commercial décide : rien ne part sans un mandat qu'il a donné, daté, borné (25 par jour),
 * révocable, arrêté dès que la personne répond. L'écran dit la vérité du serveur — mandat, période, reste du jour — et
 * « voie d'envoi non ouverte » tant que la voie ne l'est pas : dans ce cas AUCUN bouton d'envoi n'est rendu, jamais un
 * bouton qui promet ce que le code ne peut pas faire. Les états chargement, erreur, vide et « non ouvert » sont des
 * états. Le corps n'est jamais relu ni affiché ici : il part dans la requête d'envoi, point.
 */
export function LinkedinDelegationCard({ contact, text }: { contact: Contact; text: string }) {
  const { t, i18n } = useTranslation('engagement')
  const status = useLinkedinSendStatus()
  const grant = useGrantLinkedinMandate()
  const revoke = useRevokeLinkedinMandate()
  const send = useSendLinkedinMessage()
  const locale = i18n.language

  if (status.isLoading) {
    return <Frame>{t('linkedinDelegation.loading')}</Frame>
  }
  if (status.isError || !status.data) {
    return (
      <Frame>
        <p>{t('linkedinDelegation.error')}</p>
        <Button size="sm" variant="outline" onClick={() => status.refetch()}>
          {t('linkedinDelegation.retry')}
        </Button>
      </Frame>
    )
  }

  const { mandate, dailyLimit, remainingToday, routeOpen } = status.data
  const result = send.data as LinkedInSendView | undefined

  return (
    <Frame>
      {mandate ? (
        <>
          <p>
            {mandate.revokedAt
              ? t('linkedinDelegation.revoked', { date: formatDay(mandate.revokedAt, locale) })
              : mandate.active
                ? t('linkedinDelegation.period', {
                    from: formatDay(mandate.validFrom, locale),
                    until: formatDay(mandate.validUntil, locale),
                    limit: mandate.dailyLimit,
                  })
                : t('linkedinDelegation.inactive', { date: formatDay(mandate.validUntil, locale) })}
          </p>
          {mandate.active ? (
            <p>{t('linkedinDelegation.remaining', { remaining: remainingToday, limit: dailyLimit })}</p>
          ) : null}
        </>
      ) : routeOpen ? (
        <p>{t('linkedinDelegation.none')}</p>
      ) : null}

      {routeOpen ? null : (
        <>
          <p className="font-medium text-[var(--bellum-text-primary)]">{t('linkedinDelegation.notOpen.title')}</p>
          <p>{t('linkedinDelegation.notOpen.hint')}</p>
        </>
      )}

      {routeOpen ? (
        <div className="flex flex-wrap items-center gap-2">
          {mandate?.active ? (
            <>
              <Button
                size="sm"
                icon={Send}
                disabled={remainingToday <= 0 || send.isPending}
                onClick={() => send.mutate({ contactId: contact.id, body: text })}
              >
                {t('linkedinDelegation.send')}
              </Button>
              <Button size="sm" variant="ghost" disabled={revoke.isPending} onClick={() => revoke.mutate(mandate.id)}>
                {t('linkedinDelegation.revoke')}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={grant.isPending}
              onClick={() => grant.mutate({ validUntil: new Date(Date.now() + MANDATE_DAYS * DAY_MS).toISOString() })}
            >
              {t('linkedinDelegation.grant', { days: MANDATE_DAYS })}
            </Button>
          )}
        </div>
      ) : null}

      {routeOpen && !mandate?.active ? (
        <p className="text-xs">{t('linkedinDelegation.grantHint', { limit: dailyLimit })}</p>
      ) : null}

      {result ? (
        <p role="status" className="font-medium text-[var(--bellum-text-primary)]">
          {resultText(t, result)}
        </p>
      ) : null}
    </Frame>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('engagement')
  return (
    <section
      aria-label={t('linkedinDelegation.aria')}
      className="mt-2 flex w-full flex-col gap-1.5 rounded-control border border-[var(--bellum-border)] p-3 text-sm text-[var(--bellum-text-secondary)]"
    >
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-[var(--bellum-text-muted)]">
        <ShieldCheck className="size-3.5" aria-hidden="true" />
        {t('linkedinDelegation.title')}
      </h4>
      {children}
    </section>
  )
}

/** Une phrase par issue : un envoi vérifié, un doute (timeout), un refus nommé, un échec — jamais confondus. */
function resultText(t: TFunction<'engagement'>, result: LinkedInSendView): string {
  switch (result.status) {
    case 'sent':
      return t('linkedinDelegation.result.sent')
    case 'unknown':
      return t('linkedinDelegation.result.unknown')
    case 'not_open':
      return t('linkedinDelegation.result.notOpen')
    case 'failed':
      return t('linkedinDelegation.result.failed')
    case 'refused':
      return refusalText(t, result.reason)
  }
}

function refusalText(t: TFunction<'engagement'>, reason: LinkedInSendView['reason']): string {
  switch (reason) {
    case 'revoked':
      return t('linkedinDelegation.result.refused.revoked')
    case 'not_yet_valid':
      return t('linkedinDelegation.result.refused.not_yet_valid')
    case 'expired':
      return t('linkedinDelegation.result.refused.expired')
    case 'recipient_replied':
      return t('linkedinDelegation.result.refused.recipient_replied')
    case 'previous_unknown':
      return t('linkedinDelegation.result.refused.previous_unknown')
    case 'daily_limit_reached':
      return t('linkedinDelegation.result.refused.daily_limit_reached')
    case 'demo':
      return t('linkedinDelegation.result.refused.demo')
    case 'no_mandate':
    case null:
      return t('linkedinDelegation.result.refused.no_mandate')
  }
}
