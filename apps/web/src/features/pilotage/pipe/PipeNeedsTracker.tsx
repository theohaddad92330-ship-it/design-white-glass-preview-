import { Card, Text } from '@bellum/ui'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useOpenNeeds } from '@/features/projects/open-needs/hooks/useOpenNeeds'
import { useFinanceAccess } from '@/features/propagation/api'
import { formatDate } from '@/lib/locale'
import { formatCents } from '@/lib/money'
import { needsTracker } from './needs-tracker'

/** Le plafond d'une lecture de la liste des besoins (`openNeedsQuerySchema.limit`). */
const TRACKER_PAGE = 200

/**
 * RV4-E-FIX 4295.13 (#4016.8e) — LE TRACEUR DU PIPE, dans Pilotage › Pipe : le CA potentiel des besoins ouverts
 * (cumul journalier TJM × effectif) et le dernier TJM connu. Le calcul vit dans `needs-tracker.ts`, le MÊME que
 * le bandeau de `/projects/needs` (GA-26 : un seul sens à « CA potentiel »).
 *
 * Doctrine : derrière le droit financier (`canReadPipeAmounts`) — RETIRÉ, jamais à 0, sans lui ; un besoin sans
 * tarif se compte à part ; au-delà de la page lue, le chiffre est un PLANCHER et le dit.
 */
export function PipeNeedsTracker() {
  const { t } = useTranslation('pilotagePipe')
  const { canReadPipeAmounts } = useFinanceAccess()
  const query = useMemo(() => ({ offset: 0, limit: TRACKER_PAGE }), [])
  const { data, isError } = useOpenNeeds(query, { enabled: canReadPipeAmounts })
  const tracker = useMemo(() => needsTracker(data?.data ?? []), [data])
  if (!canReadPipeAmounts) return null

  const rows = data?.data
  const lastDate = tracker.lastTjm?.at ? formatDate(tracker.lastTjm.at, { dateStyle: 'medium' }) : null

  return (
    <section aria-labelledby="pipe-needs-tracker-title" className="space-y-2" data-testid="pipe-needs-tracker">
      <h2 id="pipe-needs-tracker-title" className="text-base font-semibold text-[var(--bellum-text-primary)]">
        {t('tracker.title')}
      </h2>
      {isError ? (
        <Text size="sm" color="text-muted-foreground" role="alert">
          {t('page.loadError')}
        </Text>
      ) : !data ? (
        <Text size="sm" color="text-muted-foreground">
          {t('page.loading')}
        </Text>
      ) : (
        <Card className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="space-y-0.5">
            <Text size="xs" color="text-muted-foreground" className="block">
              {t('tracker.potential')}
            </Text>
            <Text size="lg" weight="semibold" className="block tabular-nums">
              {tracker.potentialDailyCents === null
                ? t('tracker.noRate')
                : t('tracker.daily', { amount: formatCents(tracker.potentialDailyCents) })}
            </Text>
            {tracker.withoutRate > 0 ? (
              <Text size="xs" color="text-muted-foreground" className="block">
                {t('tracker.withoutRate', { count: tracker.withoutRate })}
              </Text>
            ) : null}
            {data && rows && data.pagination.totalItems > rows.length ? (
              <Text size="xs" color="text-muted-foreground" className="block">
                {t('tracker.floor', { read: rows.length, total: data.pagination.totalItems })}
              </Text>
            ) : null}
          </div>
          <div className="space-y-0.5">
            <Text size="xs" color="text-muted-foreground" className="block">
              {t('tracker.lastTjm')}
            </Text>
            {tracker.lastTjm ? (
              <>
                <Text size="lg" weight="semibold" className="block tabular-nums">
                  {t('tracker.daily', { amount: formatCents(tracker.lastTjm.cents) })}
                </Text>
                <Text size="xs" color="text-muted-foreground" className="block">
                  {lastDate
                    ? t('tracker.lastTjmBasisDated', { title: tracker.lastTjm.title, date: lastDate })
                    : t('tracker.lastTjmBasis', { title: tracker.lastTjm.title })}
                </Text>
              </>
            ) : (
              <Text size="sm" color="text-muted-foreground" className="block">
                {t('tracker.noLastTjm')}
              </Text>
            )}
          </div>
        </Card>
      )}
    </section>
  )
}
