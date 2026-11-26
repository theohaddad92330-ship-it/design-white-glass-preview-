import { Box, Button, Text } from '@bellum/ui'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { useAlerts } from './alertsContext'
import { isIgnored } from './contactAlertMemory'

const DATE_OPTIONS: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = { ...DATE_OPTIONS, hour: '2-digit', minute: '2-digit' }

/**
 * #4596 — l'enveloppe d'UNE carte du bandeau « Avant d'agir » : elle l'enregistre (le bandeau compte et sait si
 * elle est neuve), et lui donne ses trois gestes — son geste propre (`gestures`, il mène quelque part),
 * « Revérifier » (relit, dit QUAND, n'écrit rien : une valeur gardée par un humain reste) et « Ignorer »
 * (par carte, réversible, n'efface rien : la carte reste listée, « ignorée le <date> »).
 *
 * Hors bandeau (la même carte sert la fiche compte) : les enfants, tels quels.
 * `signature` change avec le CONTENU de la carte : l'ancien « lu » et l'ancien « ignoré » ne valent plus.
 */
export function ContactAlertSlot({
  id,
  title,
  signature,
  onRecheck,
  gestures,
  ignoreLabel,
  children,
}: {
  id: string
  title: string
  signature: string
  onRecheck?: () => Promise<unknown>
  gestures?: ReactNode
  /** Quand « ignorer » a un sens plus précis pour la carte (ex. « Garder la fiche telle quelle »). */
  ignoreLabel?: string
  children: ReactNode
}) {
  const { t } = useTranslation('contacts')
  const alerts = useAlerts()
  const register = alerts?.register
  const [pending, setPending] = useState(false)

  useEffect(() => register?.(id, { title, signature }), [register, id, title, signature])

  if (!alerts) return <>{children}</>

  const memory = alerts.memory[id]
  const recheckedOn = formatDate(memory?.recheckedAt, DATE_TIME_OPTIONS)

  if (isIgnored(memory, signature)) {
    return (
      <Box
        display="flex"
        className="flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--bellum-border)] px-4 py-2"
      >
        <Text element="p" size="sm" className="min-w-0 text-[var(--bellum-text-secondary)]">
          <span className="font-medium">{title}</span>
          {' · '}
          {t('avantDagir.ignoredOn', { date: formatDate(memory?.ignoredAt, DATE_OPTIONS) ?? '' })}
        </Text>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          onClick={() => alerts.restore(id, signature)}
        >
          {t('avantDagir.restore')}
        </Button>
      </Box>
    )
  }

  const recheck = async () => {
    if (!onRecheck) return
    setPending(true)
    try {
      await onRecheck()
      alerts.markRechecked(id)
    } catch {
      // la vérification n'a pas eu lieu : on ne date rien
    } finally {
      setPending(false)
    }
  }

  return (
    <Box className="space-y-2">
      {children}
      <Box display="flex" className="flex-wrap items-center gap-2">
        {gestures}
        {onRecheck ? (
          <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={recheck} aria-busy={pending}>
            {t('avantDagir.recheck')}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-11"
          title={t('avantDagir.ignoreTitle')}
          onClick={() => alerts.ignore(id, signature)}
        >
          {ignoreLabel ?? t('avantDagir.ignore')}
        </Button>
        {recheckedOn ? (
          <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('avantDagir.rechecked', { date: recheckedOn })}
          </Text>
        ) : null}
      </Box>
    </Box>
  )
}
