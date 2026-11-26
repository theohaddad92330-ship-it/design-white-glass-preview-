import type { MailboxStatus } from '@bellum/contracts'
import { Box, Popover, PopoverContent, PopoverTrigger, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Check, Minus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MailboxSignatureCard } from '../MailboxSignatureCard'

const INTEGRATIONS_ROUTE = '/integrations'
const CAPABILITIES = ['read', 'draft', 'send', 'labels', 'outOfOffice'] as const

/**
 * Théo B m1.A5 / m1.A8 — la ligne d'état de la boîte (`.mb-status`), sous l'en-tête : ce qui est lu, depuis quand, ce
 * que Laura peut y faire, et la réponse d'absence. Elle remplace la carte « Ta messagerie est connectée ».
 *
 * #1398.1 — l'ADRESSE de la boîte, jamais le nom de l'éditeur (GA-45) ; « Fils relus à » date la LECTURE en cours
 * (rien n'est synchronisé) et se tait tant qu'aucune lecture n'a abouti.
 */
export function MailboxStatusLine({
  status,
  fetchedAt,
  language,
}: {
  status: MailboxStatus
  /** Horodatage de la lecture en cours (react-query). `0` = rien n'a encore abouti. */
  fetchedAt: number
  language: string
}) {
  const { t } = useTranslation('mailbox')
  const freshness = fetchedAt
    ? new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(new Date(fetchedAt))
    : null

  return (
    <Box
      data-testid="mailbox-status-line"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card border border-[var(--bellum-border)] bg-card px-4 py-2"
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-[var(--success-soft-text)]" />
      <Text element="span" size="sm" weight="medium">
        {status.address ? t('connector.connectedAs', { address: status.address }) : t('connector.connected')}
      </Text>
      {freshness ? (
        <Text element="span" size="sm" className="text-[var(--bellum-text-secondary)]">
          · {t('connector.fetchedAt', { time: freshness })}
        </Text>
      ) : null}
      {/* #2756 — se tait à UNE messagerie (le cas courant). */}
      {status.connectedCount > 1 ? (
        <Text element="span" size="sm" className="text-[var(--bellum-text-secondary)]">
          · {t('connector.otherConnected', { count: status.connectedCount - 1 })}
        </Text>
      ) : null}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
          >
            {t('status.capsLink')}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3">
          <Text element="h3" size="sm" weight="semibold">
            {t('status.capsTitle')}
          </Text>
          {status.address ? (
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {status.address}
            </Text>
          ) : null}
          <ul className="flex flex-col gap-1.5">
            {CAPABILITIES.map(key => (
              <li key={key} className="flex items-center gap-2 text-sm">
                {status.capabilities[key] ? (
                  <Check className="size-4 shrink-0 text-[var(--success-soft-text)]" aria-label={t('status.granted')} />
                ) : (
                  <Minus
                    className="size-4 shrink-0 text-[var(--bellum-text-secondary)]"
                    aria-label={t('status.notGranted')}
                  />
                )}
                {t(`capabilities.${key}`)}
              </li>
            ))}
          </ul>
          <MailboxSignatureCard variant="status" />
          <Link
            to={INTEGRATIONS_ROUTE}
            className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
          >
            {t('capabilities.cta')}
          </Link>
        </PopoverContent>
      </Popover>
      <span aria-hidden className="text-[var(--bellum-text-secondary)]">
        ·
      </span>
      {/* Théo B m1.A8 — la réponse d'absence se règle dans Intégrations (tiroir de la messagerie). */}
      <Link
        to={INTEGRATIONS_ROUTE}
        className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
      >
        {t('absence.link')}
      </Link>
    </Box>
  )
}
