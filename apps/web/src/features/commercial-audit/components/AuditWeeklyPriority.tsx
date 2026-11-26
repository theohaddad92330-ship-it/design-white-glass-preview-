import { useTranslation } from 'react-i18next'
import { Text } from '@bellum/ui'
import { AuditCard } from './AuditCard'
import { ConfidenceBadge } from './ConfidenceBadge'
import type { AuditWeeklyPriority as AuditWeeklyPriorityValue } from '../lib/audit-priority'

/**
 * #2090.31 — LA CARTE « PRIORISER LA SEMAINE ».
 *
 * Une seule action, dérivée (`lib/audit-priority.ts`) — jamais une liste de
 * tâches inventée. Sans rien à prioriser, l'écran le NOMME.
 */
export function AuditWeeklyPriority({ priority }: { priority: AuditWeeklyPriorityValue | null }) {
  const { t } = useTranslation('commercialAudit')

  return (
    <AuditCard className="space-y-2">
      <Text
        element="h2"
        size="xs"
        weight="semibold"
        className="uppercase tracking-wide text-[var(--bellum-text-muted)]"
      >
        {t('priority.title')}
      </Text>
      {priority === null ? (
        <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
          {t('priority.unmeasured')}
        </Text>
      ) : (
        <div className="space-y-1">
          <Text element="p" size="sm" weight="medium">
            {priority.action}
          </Text>
          <ConfidenceBadge confidence={priority.confidence} />
        </div>
      )}
    </AuditCard>
  )
}
