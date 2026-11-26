import type { PilotageLevelReport, StockBaseline } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { revealTargetProps } from '@/lib/reveal-target'
import { chainLevelAnchor, isAlertingLevel } from './chain-alerts'
import { chainOf, primaryMetric, secondaryOf } from './chain-layout'
import { LevelStatusIcon, MetricValue } from './LevelDetail'

/**
 * Cockpit › la chaîne COMPACTE : les huit maillons sur une ligne (une pastille
 * par maillon : état, nom, chiffre et son dénominateur), qui se replie sur
 * plusieurs lignes sous 768 px. Le détail — glossaire, complétude, `ChainStrip`
 * — vit dans le dépliant, passé en `children` : ce composant ne recalcule rien.
 */
export function ChainCompact({
  levels,
  baseline,
  children,
}: {
  levels: PilotageLevelReport[]
  baseline: StockBaseline | undefined
  children: ReactNode
}) {
  const { t } = useTranslation('pilotage')
  const [open, setOpen] = useState(false)
  const ordered = [...chainOf(levels), ...secondaryOf(levels)]

  return (
    <div>
      {ordered.length > 0 ? (
        <ul aria-label={t('cockpit.chainRowLabel')} className="mb-2 flex flex-wrap gap-2" data-testid="chain-compact">
          {ordered.map(level => {
            const metric = primaryMetric(level)
            return (
              <li
                key={level.level}
                // Cible des cartes « décisions » (`DecisionStrip`) : la ligne compacte est
                // toujours visible, le détail ne l'est pas.
                {...(isAlertingLevel(level) ? revealTargetProps(chainLevelAnchor(level.level)) : {})}
                className="scroll-mt-4 flex min-h-11 items-center gap-2 rounded-md border border-[var(--bellum-border)] px-3 py-1"
              >
                <LevelStatusIcon level={level} />
                <Text size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
                  {t(`levels.${level.level}.title`)}
                </Text>
                {metric ? <MetricValue metric={metric} baseline={baseline} showLabel={false} /> : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="cockpit-chain-detail"
        onClick={() => setOpen(current => !current)}
        className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--bellum-text-accent)]"
      >
        {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
        {open ? t('cockpit.chainClose') : t('cockpit.chainOpen')}
      </button>
      {open ? <div id="cockpit-chain-detail">{children}</div> : null}
    </div>
  )
}
