'use client'

// #1643 — LineChart : « tooltip au survol, ligne verticale de repère ». Seule
// la couche d'interactivité est cliente ; les tracés (polylines/points)
// restent un rendu serveur passé en `children`, pour que `charts.tsx` reste
// « pure presentational server components » ailleurs dans le fichier.

import type { MouseEvent, ReactNode } from 'react'
import { useState } from 'react'

type SeriesGeometry = {
  name: string
  color: string
  /** Déjà formatées côté serveur — `null` = point non mesuré, jamais « 0 ».
   * Une fonction ne peut pas traverser la frontière serveur → client (RSC) ;
   * `LineChart` (serveur) applique `format` une fois, ici, pour de bon. */
  formatted: (string | null)[]
  labels: string[]
}

export function LineChartHoverLayer({
  width,
  height,
  n,
  series,
  children,
}: {
  width: number
  height: number
  n: number
  series: readonly SeriesGeometry[]
  children: ReactNode
}) {
  const [hover, setHover] = useState<number | null>(null)

  function onMove(e: MouseEvent<SVGRectElement>): void {
    if (n === 0) return
    if (n === 1) {
      setHover(0)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setHover(Math.round(ratio * (n - 1)))
  }

  const guideX = hover == null ? null : n > 1 ? (hover / (n - 1)) * width : width / 2

  return (
    <div style={{ position: 'relative' }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {children}
        {guideX != null ? (
          <line
            x1={guideX}
            x2={guideX}
            y1={0}
            y2={height}
            stroke="var(--border)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {n > 0 ? (
          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill="transparent"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          />
        ) : null}
      </svg>
      {hover != null && guideX != null ? (
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: `${(guideX / width) * 100}%`,
            transform: guideX > width / 2 ? 'translateX(-100%)' : 'translateX(0)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 11,
            color: 'var(--text)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.18)',
          }}
        >
          <div style={{ color: 'var(--muted)', marginBottom: 4 }}>{series[0]?.labels[hover] ?? ''}</div>
          {series.map(s => {
            const formatted = s.formatted[hover] ?? null
            return (
              <div key={s.name} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 2, background: s.color }} />
                <span>{s.name}</span>
                <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                  {formatted ?? 'non mesuré'}
                </span>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
