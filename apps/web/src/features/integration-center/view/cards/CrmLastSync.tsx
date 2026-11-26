import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatDateTime } from '@/lib/locale'
import { syncElapsed } from './crm-sync-when'

/**
 * #4290.2 — LA dernière synchronisation d'un CRM, dite UNE fois, sous UNE forme pour tous (GA-26) :
 * « Dernière synchronisation : 22/10/2026 09:10 (il y a 7 min) ». Avant : trois phrases selon l'âge ou l'état
 * (« Dernière synchro réussie », « Synchronisé le … », « il y a 7 min »). Date illisible ⇒ RIEN.
 */
export function CrmLastSync({ iso, testId, now = new Date() }: { iso: string; testId: string; now?: Date }) {
  const { t, i18n } = useTranslation('settings', { keyPrefix: 'integrations.crmReadScope' })
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return null
  const elapsed = syncElapsed(iso, now, i18n.language)
  const relative = elapsed === null ? null : elapsed.kind === 'now' ? t('attemptNow') : elapsed.text
  const date = formatDateTime(new Date(at))
  return (
    <Text data-testid={testId} size="xs" className="text-[var(--bellum-text-secondary)]">
      {relative === null ? t('lastSyncAbsolute', { date }) : t('lastSyncLine', { date, relative })}
    </Text>
  )
}
