import { Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatDateRange } from '@/lib/locale'
import { formatCents } from '@/lib/money'
import { usePipeWaterfall } from './api'
import { waterfallBars, type WaterfallBar } from './pipe-format'

/** La couleur dit le SENS du mouvement (entrée / sortie / état), décidé sur le signe — pas sur une catégorie. */
const barTone = (kind: WaterfallBar['kind']): string =>
  kind === 'minus'
    ? 'bg-[var(--bellum-danger)]'
    : kind === 'plus'
      ? 'bg-[var(--bellum-success)]'
      : 'bg-[var(--bellum-primary-500)]'

/**
 * LE WATERFALL DU PIPE — ouverture → entrées → relevés → baissés → perdues →
 * signées → clôture, NON PONDÉRÉ, sur le mois en cours.
 *
 * Calculé côté serveur (`GET /pilotage/pipe/waterfall`), où l'équation
 * d'équilibre est prouvée par test. Ici on ne recompte rien : on LIT, et on
 * dit la période et la base (combien d'opportunités ouvertes à l'ouverture et
 * à la clôture). Une opportunité sans montant sort des barres et se compte à
 * part — jamais un « 0 € » silencieux.
 */
export function PipeWaterfall() {
  const { t } = useTranslation('pilotagePipe')
  const { data, isLoading, isError } = usePipeWaterfall()

  return (
    <section aria-labelledby="pipe-waterfall-title" className="space-y-2">
      <h2 id="pipe-waterfall-title" className="text-base font-semibold text-[var(--bellum-text-primary)]">
        {t('waterfall.title')}
      </h2>
      {isLoading ? (
        <Text size="sm" color="text-muted-foreground">
          {t('page.loading')}
        </Text>
      ) : isError || !data ? (
        <Text size="sm" color="text-muted-foreground" role="alert">
          {t('page.loadError')}
        </Text>
      ) : (
        <WaterfallBody waterfall={data} />
      )}
    </section>
  )
}

function WaterfallBody({ waterfall }: { waterfall: NonNullable<ReturnType<typeof usePipeWaterfall>['data']> }) {
  const { t } = useTranslation('pilotagePipe')
  const bars = waterfallBars(waterfall)
  const max = Math.max(1, ...bars.map(bar => Math.abs(bar.cents)))
  // Optional chaining : une réponse sans bornes ne fait pas tomber la page, elle n'affiche pas de plage.
  const range = formatDateRange(waterfall.from?.slice(0, 10) ?? '', waterfall.to?.slice(0, 10) ?? '')

  return (
    <Card className="space-y-3 p-4">
      <div className="space-y-0.5">
        {range ? (
          <Text size="sm" weight="medium" className="block">
            {t('waterfall.period', { range })}
          </Text>
        ) : null}
        <Text size="xs" color="text-muted-foreground" className="block">
          {t('waterfall.basis', { count: waterfall.openingCount, closing: waterfall.closingCount })}
          {' · '}
          {t('waterfall.unweighted')}
        </Text>
      </div>
      <ol className="space-y-2" data-testid="pipe-waterfall-bars">
        {bars.map(bar => (
          <li
            key={bar.key}
            className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[12rem_minmax(0,1fr)_8rem]"
          >
            <Text size="sm" className="min-w-0 break-words">
              {t(`waterfall.bars.${bar.key}`)}
            </Text>
            <div className="h-3 rounded-full bg-[var(--bellum-surface-2)]" aria-hidden="true">
              <div
                className={`h-3 rounded-full ${barTone(bar.kind)}`}
                style={{ width: `${Math.max(2, Math.round((Math.abs(bar.cents) / max) * 100))}%` }}
              />
            </div>
            <Text size="sm" weight="medium" className="text-right tabular-nums">
              {bar.kind === 'plus' ? '+ ' : bar.kind === 'minus' ? '− ' : ''}
              {formatCents(Math.abs(bar.cents))}
            </Text>
          </li>
        ))}
      </ol>
      {waterfall.unexplainedCents !== 0 ? (
        <Text size="xs" color="text-muted-foreground" className="block">
          {t('waterfall.unexplainedHint')}
        </Text>
      ) : null}
      {waterfall.withoutAmountCount > 0 ? (
        <Text size="xs" color="text-muted-foreground" className="block">
          {t('waterfall.withoutAmount', { count: waterfall.withoutAmountCount })}
        </Text>
      ) : null}
    </Card>
  )
}
