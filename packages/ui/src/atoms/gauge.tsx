'use client'

import * as React from 'react'
import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts'

const sizes = {
  tiny: 38,
  small: 48,
  medium: 72,
  large: 104,
}

export interface GaugeProps {
  size?: keyof typeof sizes
  value: number
  colors?: { [name: string]: string }
  showValue?: boolean
  roundedValue?: boolean
}

/* Bellum semantic colors for score thresholds */
const defaultColors = {
  '0': 'var(--bellum-danger)',
  '50': 'var(--bellum-warning)',
  '70': 'var(--bellum-success)',
}

export const getGaugeColor = (value: number): { text: string; bg: string } => {
  if (value >= 70)
    return {
      text: 'text-[var(--success-soft-text)]',
      bg: 'bg-[color-mix(in_srgb,var(--bellum-success)_12%,transparent)]',
    }
  if (value >= 50)
    return {
      text: 'text-[var(--warning-soft-text)]',
      bg: 'bg-[color-mix(in_srgb,var(--bellum-warning)_12%,transparent)]',
    }
  return { text: 'text-[var(--danger-soft-text)]', bg: 'bg-[color-mix(in_srgb,var(--bellum-danger)_12%,transparent)]' }
}

// #3713 — recette RQ4 09/10 : « petit tiret vert isolé (~2×6 px) au-dessus
// du score (94, 63) — l'anneau semble cassé ». `cornerRadius` est en PIXELS
// pour Recharts, pas un pourcentage : à 999 (bien au-delà de l'épaisseur
// réelle de l'anneau, ~5 px pour la taille `tiny`), le calcul du congé
// dépasse la bande et laisse un fragment de tracé disjoint près de l'angle de
// départ (90°, midi) — visible sur les scores où l'arc couvre presque tout le
// cercle. Un congé borné à la MOITIÉ de l'épaisseur réelle de l'anneau donne
// déjà des bouts pleinement arrondis (aller au-delà ne change pas le rendu
// visé, seulement le défaut) ; il doit donc rester calculé, jamais une
// constante arbitraire, si `INNER_RADIUS_PCT`/`OUTER_RADIUS_PCT` changent.
const INNER_RADIUS_PCT = 0.72
const OUTER_RADIUS_PCT = 1

/** Épaisseur réelle de l'anneau (px), pour un diamètre total `px`. */
function gaugeRingThickness(px: number): number {
  return (px / 2) * (OUTER_RADIUS_PCT - INNER_RADIUS_PCT)
}

/** Le congé (`cornerRadius`, en px) qui arrondit pleinement les bouts de
 *  l'anneau SANS déborder sa propre épaisseur — voir le commentaire ci-dessus. */
export function gaugeCornerRadius(px: number): number {
  return gaugeRingThickness(px) / 2
}

/**
 * #4622.4 — 24 avertissements Recharts « width(-1) and height(-1) » en vingt minutes. `minWidth`/`minHeight` étaient déjà
 * posés : le défaut était ailleurs — la jauge se montait dans un conteneur MASQUÉ (onglet fermé, volet replié,
 * `display: none`), que le navigateur mesure à ZÉRO, et `ResponsiveContainer` s'en plaignait à chaque mesure.
 * On ne monte donc le graphique que lorsque l'enveloppe a une taille non nulle, et on le démonte quand elle
 * retombe à zéro. Sans `ResizeObserver` (rien à mesurer), on monte : on ne cache pas une jauge sur une donnée absente.
 */
function useHasSize<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = React.useRef<T | null>(null)
  const [hasSize, setHasSize] = React.useState(false)

  React.useEffect(() => {
    const element = ref.current
    if (!element) return
    if (typeof ResizeObserver === 'undefined') {
      setHasSize(true)
      return
    }
    const rect = element.getBoundingClientRect()
    setHasSize(rect.width > 0 && rect.height > 0)
    const observer = new ResizeObserver(entries => {
      const box = entries[entries.length - 1]?.contentRect
      setHasSize(box !== undefined && box.width > 0 && box.height > 0)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, hasSize]
}

export const Gauge = ({
  size = 'medium',
  value,
  colors = defaultColors,
  showValue = false,
  roundedValue = true,
}: GaugeProps) => {
  const roundValue = roundedValue ? Math.round(value * 100) : value
  const clamped = Math.min(Math.max(roundValue, 0), 100)
  const [wrapperRef, hasSize] = useHasSize<HTMLDivElement>()
  const px = sizes[size]
  const cornerRadius = gaugeCornerRadius(px)

  const primary =
    colors.primary ??
    colors[
      Math.max(
        0,
        ...Object.keys(colors)
          .map(Number)
          .filter(key => key <= clamped),
      ).toString()
    ] ??
    'var(--bellum-primary-500)'

  const track = colors.secondary ?? 'var(--bellum-surface-2)'
  const data = [{ name: 'score', value: clamped, fill: primary }]

  return (
    <div
      ref={wrapperRef}
      className="relative"
      style={{ width: px, height: px }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
    >
      {/* #4622.4 — jamais monté tant que l'enveloppe est mesurée à zéro (conteneur masqué). */}
      {hasSize && (
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <RadialBarChart
            data={data}
            startAngle={90}
            endAngle={-270}
            innerRadius={`${INNER_RADIUS_PCT * 100}%`}
            outerRadius={`${OUTER_RADIUS_PCT * 100}%`}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar background={{ fill: track }} dataKey="value" cornerRadius={cornerRadius} angleAxisId={0} />
          </RadialBarChart>
        </ResponsiveContainer>
      )}
      {showValue && size !== 'tiny' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-bold" style={{ color: primary, fontSize: px * 0.3 }}>
            {clamped}
          </span>
        </div>
      )}
    </div>
  )
}
