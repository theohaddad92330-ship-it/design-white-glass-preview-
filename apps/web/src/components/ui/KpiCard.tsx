import { cn } from '@bellum/ui'
import { motion } from 'framer-motion'
import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'

type KpiCardProps = {
  label: string
  value: number | string
  /** > 0 → vert (TrendingUp), < 0 → rouge (TrendingDown), 0/undefined → gris (Minus). */
  trend?: number
  trendLabel?: string
  /** Affiche la valeur en font monospace (Geist Mono). Défaut : true. */
  mono?: boolean
  /**
   * Ce que le chiffre ne dit pas de lui-même — aujourd'hui « calculé sur … »
   * (tome 7, loi 2, n°6).
   *
   * Il vit DANS la carte et non en dessous : posée à l'extérieur, la phrase se
   * détache du chiffre qu'elle qualifie et se lit comme une légende de la
   * rangée entière. Ce n'est pas un emplacement à courbe ni à tendance — la
   * carte n'en dessine aucune, faute de série mesurée (GA-48).
   */
  footer?: ReactNode
}

/**
 * Carte KPI : label en haut, gros chiffre, et l'écart MESURÉ s'il existe.
 *
 * ⚠️ Elle ne dessine plus de courbe, et c'est délibéré (28/08/2026). Elle en
 * portait une, alimentée par des valeurs écrites à la main — une courbe
 * montante à côté d'un chiffre vrai se lit comme la tendance de ce chiffre.
 * Le contrat `dashboard` ne sert aucune série : que des compteurs et deux
 * écarts scalaires. Tant qu'aucun historique n'arrive, il n'y a pas de courbe,
 * et surtout pas de courbe PLATE — plat est une affirmation, pas une absence.
 * Garde GA-48 (`architecture/no-fabricated-series.test.ts`).
 *
 * 100% Tailwind — `bg-[var(--bellum-surface-1)]` aligné avec le reste des cartes du
 * dashboard. Les couleurs de tendance sont des classes utilitaires
 * conditionnelles (pas d'inline `color` style).
 */
export function KpiCard({ label, value, trend, trendLabel, mono = true, footer }: KpiCardProps) {
  const isFlat = trend === undefined || trend === 0
  const isUp = trend !== undefined && trend > 0
  const TrendIcon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown
  const trendColorClass = isFlat
    ? 'text-[var(--text-muted)]'
    : isUp
      ? 'text-[var(--success-soft-text)]'
      : 'text-[var(--danger-soft-text)]'

  const showTrend = trend !== undefined || trendLabel

  return (
    <motion.div
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      className="rounded-xl p-5 cursor-default bg-[var(--bellum-surface-1)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)]"
    >
      <p className="text-label mb-3">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p
            className={cn(
              'text-4xl font-bold leading-none text-[var(--text-primary)]',
              mono ? 'font-mono' : 'font-sans',
            )}
          >
            {value}
          </p>
          {showTrend && (
            <div className={cn('flex items-center gap-1 mt-2', trendColorClass)}>
              <TrendIcon size={12} />
              <span className="text-xs font-medium">{trendLabel ?? `${isUp ? '+' : ''}${trend}`}</span>
            </div>
          )}
          {footer && <div className="mt-2">{footer}</div>}
        </div>
      </div>
    </motion.div>
  )
}
