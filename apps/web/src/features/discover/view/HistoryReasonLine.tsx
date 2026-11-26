import { useTranslation } from 'react-i18next'
import type { HistoryReason } from '@/features/discover/lib/discover-history-blocks'

/**
 * #4758 — « 11 offres Java entre 2025 et 2026, la dernière il y a 3 mois » : la RAISON pour laquelle un compte
 * sans signal récent remonte. Elle nomme ce que l'entreprise a cherché (la techno), le nombre, la période et
 * l'âge du plus récent — jamais la source qui l'a fournie, jamais un score.
 */
const DAYS_PER_MONTH = 30
const DAYS_PER_YEAR = 365

export function HistoryReasonLine({ reason }: { reason: HistoryReason }) {
  const { t } = useTranslation('discover')
  const period =
    reason.fromYear === reason.toYear
      ? t('historyBlocks.reason.periodSame', { year: reason.toYear })
      : t('historyBlocks.reason.periodRange', { from: reason.fromYear, to: reason.toYear })
  const ago =
    reason.lastAgeDays >= DAYS_PER_YEAR
      ? t('historyBlocks.reason.agoYears', { count: Math.floor(reason.lastAgeDays / DAYS_PER_YEAR) })
      : reason.lastAgeDays >= 2 * DAYS_PER_MONTH
        ? t('historyBlocks.reason.agoMonths', { count: Math.round(reason.lastAgeDays / DAYS_PER_MONTH) })
        : t('historyBlocks.reason.agoDays', { count: reason.lastAgeDays })
  const key = `historyBlocks.reason.${reason.kind}${reason.subject ? 'Named' : ''}`
  return (
    <span data-testid="candidate-history-reason" className="text-xs font-medium text-[var(--bellum-text-secondary)]">
      {t(key, { count: reason.count, subject: reason.subject ?? '', period, ago })}
      {reason.evidenceInsideWindow && ` ${t('historyBlocks.reason.evidenceNotCounted')}`}
    </span>
  )
}
