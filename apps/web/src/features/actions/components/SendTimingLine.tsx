import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useSendTiming } from '../hooks/useSendTiming'

/**
 * #3289 (#3264.31/.32/.33) — LE CRÉNEAU QUE L'ÉQUIPE A APPRIS, sur « Mes relances ».
 *
 * Une seule ligne de texte sous la note de complétion (même `Text xs` muted),
 * pas une carte de plus. Elle NOMME le créneau avec ses comptes (« 4 sur 4 »),
 * jamais un pourcentage.
 *
 * Doctrine : une absence ne fait AUCUNE ligne (un canal sous le seuil de
 * tentatives, une lecture en échec ou en cours : rien n'est rendu, et surtout
 * pas « aucun créneau » qui ressemblerait à une mesure).
 */
export function SendTimingLine() {
  const { t } = useTranslation('actions')
  const { data } = useSendTiming()
  const parts = (data?.channels ?? []).flatMap(channel =>
    channel.best
      ? [
          t('center.relances.timing.part', {
            channel: t(`channels.${channel.channel}`),
            slot: t('center.relances.timing.slot', {
              weekday: t(`center.relances.timing.weekday.${channel.best.weekday}`),
              band: t(`center.relances.timing.band.${channel.best.band}`),
            }),
            answered: channel.best.answered,
            attempts: channel.best.attempts,
          }),
        ]
      : [],
  )
  if (parts.length === 0) return null
  return (
    <Text size="xs" color="text-[var(--bellum-text-muted)]" data-slot="send-timing-line">
      {t('center.relances.timing.lead')} {parts.join(' · ')}
    </Text>
  )
}
