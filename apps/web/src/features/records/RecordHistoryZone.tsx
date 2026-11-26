import type { RecordHistoryEntry, RecordPanelKind } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { useRecordStatusLabel } from './useRecordStatusLabel'

/**
 * Zone 2 — l'historique : le journal `commercial_transitions` du sujet. Un
 * consultant n'en a pas (le journal n'a pas de sujet « consultant ») : la zone
 * le DIT plutôt que de rester muette.
 */
export function RecordHistoryZone({ kind, history }: { kind: RecordPanelKind; history: RecordHistoryEntry[] }) {
  const { t } = useTranslation('projects')
  const statusLabel = useRecordStatusLabel()
  // #4191 (E6) — les états du journal se LISENT ; un état inconnu du catalogue garde sa valeur (le journal
  // est une preuve : on ne la tait pas).
  const named = (state: string) => statusLabel(kind, state) ?? state
  return (
    <section aria-labelledby="record-zone-history" data-zone="history" className="space-y-2">
      <Text element="h3" id="record-zone-history" size="sm" weight="medium" className="px-5 pt-4">
        {t('recordPanel.zones.history')}
      </Text>
      {history.length === 0 ? (
        <Text element="p" size="xs" color="text-muted-foreground" className="px-5">
          {t('recordPanel.historyEmpty')}
        </Text>
      ) : (
        <ol className="space-y-1.5 px-5">
          {history.map(entry => (
            <li key={entry.id}>
              <Text element="p" size="sm">
                {entry.fromState
                  ? t('recordPanel.transition', { from: named(entry.fromState), to: named(entry.toState) })
                  : t('recordPanel.transitionBirth', { to: named(entry.toState) })}
              </Text>
              <Text element="p" size="xs" color="text-muted-foreground">
                {formatDate(entry.occurredAt, { dateStyle: 'medium' })}
                {entry.proof ? ` · ${entry.proof}` : ''}
              </Text>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
