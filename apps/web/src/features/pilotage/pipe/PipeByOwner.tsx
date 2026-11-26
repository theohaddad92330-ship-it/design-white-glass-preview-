import type { PipeOwnerRow } from '@bellum/contracts'
import { Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatCents } from '@/lib/money'
import { formatRate } from '../view/chain-reading'
import { usePipeByOwner } from './api'

/**
 * PAR COMMERCIAL — pipe ouvert, signé de la période, taux de gain, cycle de
 * vente médian. Calculé sur le pipe NATIF (données Bellum), jamais sur le CRM
 * tiers.
 *
 * Chaque chiffre dit sa FENÊTRE et son DÉNOMINATEUR :
 *  · le taux de gain = signées ÷ (signées + perdues) sur 90 jours glissants, avec
 *    « n signées sur m clôturées » ; sous une base de 10 clôturées, pas de
 *    pourcentage (règle de `describeTrend`) ;
 *  · le cycle médian = création → signature, sur les signées des 180 jours.
 * Une absence se dit en une phrase, jamais « 0 ».
 */
export function PipeByOwner() {
  const { t } = useTranslation('pilotagePipe')
  const { data, isLoading, isError } = usePipeByOwner()

  return (
    <section aria-labelledby="pipe-owner-title" className="space-y-2">
      <div className="space-y-0.5">
        <h2 id="pipe-owner-title" className="text-base font-semibold text-[var(--bellum-text-primary)]">
          {t('byOwner.title')}
        </h2>
        <Text size="xs" color="text-muted-foreground" className="block">
          {t('byOwner.basis')}
        </Text>
      </div>
      {isLoading ? (
        <Text size="sm" color="text-muted-foreground">
          {t('page.loading')}
        </Text>
      ) : isError || !data ? (
        <Text size="sm" color="text-muted-foreground" role="alert">
          {t('page.loadError')}
        </Text>
      ) : data.owners.length === 0 ? (
        <Text size="sm" color="text-muted-foreground">
          {t('byOwner.empty')}
        </Text>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" data-testid="pipe-owners">
          {data.owners.map(owner => (
            <OwnerCard key={owner.ownerId ?? 'unassigned'} owner={owner} />
          ))}
        </ul>
      )}
    </section>
  )
}

function OwnerCard({ owner }: { owner: PipeOwnerRow }) {
  const { t } = useTranslation('pilotagePipe')
  const { t: tPilotage } = useTranslation('pilotage')
  const total = owner.winRateWon + owner.winRateLost
  const winRate =
    total === 0
      ? t('byOwner.winRateNone', { days: owner.winRateDays })
      : owner.winRate === null
        ? t('byOwner.winRateSmall', { won: owner.winRateWon, total, days: owner.winRateDays })
        : t('byOwner.winRate', {
            value: formatRate(owner.winRate, tPilotage).replace(/\s*%$/, ''),
            won: owner.winRateWon,
            total,
            days: owner.winRateDays,
          })
  return (
    <li>
      <Card className="space-y-2 p-4">
        <Text size="sm" weight="semibold" className="block">
          {owner.ownerName ?? t('byOwner.unassigned')}
        </Text>
        <dl className="space-y-1.5">
          <Metric label={t('byOwner.columns.open')}>
            {t('byOwner.open', { amount: formatCents(owner.openCents), count: owner.openCount })}
          </Metric>
          <Metric label={t('byOwner.columns.signed')}>
            {owner.signedCount === 0
              ? t('byOwner.signedNone')
              : t('byOwner.signed', { amount: formatCents(owner.signedCents), count: owner.signedCount })}
          </Metric>
          <Metric label={t('byOwner.columns.winRate')}>{winRate}</Metric>
          <Metric label={t('byOwner.columns.cycle')}>
            {owner.medianCycleDays === null
              ? t('byOwner.cycleNone', { days: owner.cycleDays })
              : t('byOwner.cycle', { count: owner.medianCycleDays, sample: owner.cycleSample, days: owner.cycleDays })}
          </Metric>
        </dl>
      </Card>
    </li>
  )
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-[var(--bellum-text-muted)]">{label}</dt>
      <dd className="text-sm text-[var(--bellum-text-primary)]">{children}</dd>
    </div>
  )
}
