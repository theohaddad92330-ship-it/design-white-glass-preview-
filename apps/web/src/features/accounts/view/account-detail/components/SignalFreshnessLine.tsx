import type { SignalFreshnessSummary } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatSignalDate } from '@/lib/signal-date'
import { nextReanalysisText, type NextReanalysisReason } from './NextReanalysisLine'

/**
 * #3682.3/.4/.5 — « Dernière vérification : aujourd'hui ; dernier événement utile : juin 2026 ».
 *
 * La date d'une recherche et celle d'un événement racontent deux choses ; la liste, le dossier
 * et Laura lisent la MÊME synthèse (`summarizeSignalFreshness`, contracts). Un fait ancien garde
 * sa date réelle et se dit « contexte historique » ; sans nouveauté la ligne le DIT, elle ne cache
 * pas le compte et n'invente aucun signal. La fréquence de veille n'apparaît que si elle est
 * réellement configurée (`watch_cadence`).
 */
type Props = {
  summary: SignalFreshnessSummary
  cadence?: 'daily' | null
  /** #4283.8 — le jour (AAAA-MM-JJ) de la prochaine ré-analyse automatique d'un compte suivi. */
  nextReanalysisAt?: string | null
  /** Recette 21/10 K4 — pourquoi un compte suivi n'a pas de date : dit, jamais un vide muet. */
  nextReanalysisReason?: NextReanalysisReason | null
  className?: string
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString()
}

export function SignalFreshnessLine({ summary, cadence, nextReanalysisAt, nextReanalysisReason, className }: Props) {
  const { t, i18n } = useTranslation('accounts')
  const verifiedDate = summary.verifiedAt ? new Date(summary.verifiedAt) : null
  const verified =
    verifiedDate && !Number.isNaN(verifiedDate.getTime())
      ? sameDay(verifiedDate, new Date())
        ? t('signalFreshnessLine.today')
        : verifiedDate.toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
      : null
  const eventDate = summary.eventDate ? formatSignalDate(summary.eventDate) : null
  const event = eventDate
    ? t(summary.state === 'historical' ? 'signalFreshnessLine.eventHistorical' : 'signalFreshnessLine.event', {
        date: eventDate,
      })
    : null
  // #4283.8 — la date de la prochaine ré-analyse (suivi explicite, tous les 15 jours), ou la raison de son absence :
  // lue de l'API, jamais calculée ici.
  const nextText = nextReanalysisText(t, i18n.language, nextReanalysisAt, nextReanalysisReason)
  const parts = [verified ? t('signalFreshnessLine.verified', { when: verified }) : null, event].filter(Boolean)
  const nothingNewer = summary.state === 'historical' && verified !== null
  // Une absence ne fait aucune ligne : sans rien de mesuré, le composant n'existe pas.
  if (parts.length === 0 && !nothingNewer && !cadence && !nextText) return null
  return (
    <Text
      element="p"
      size="xs"
      data-testid="signal-freshness-line"
      className={className ?? 'text-[var(--bellum-text-muted)]'}
    >
      {parts.join(' ; ')}
      {parts.length > 0 ? '.' : null}
      {nothingNewer ? ` ${t('signalFreshnessLine.nothingNewer')}` : null}
      {nextText ? ` ${nextText}` : null}
      {cadence === 'daily' ? ` ${t('signalFreshnessLine.cadenceDaily')}.` : null}
    </Text>
  )
}
