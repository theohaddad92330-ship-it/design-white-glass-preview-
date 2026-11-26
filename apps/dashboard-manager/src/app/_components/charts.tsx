// Zero-dependency inline-SVG charts for the dashboard. Pure presentational
// server components — no chart lib, no client JS (LineChart is the one
// exception: its hover tooltip lives in the separate `line-chart-hover.tsx`,
// so only that thin layer is a Client Component, not this whole file).

import { Fragment, type CSSProperties } from 'react'
import { computeIntensity, intensityDomain } from '@/ui/Heatmap.logic'
import { LineChartHoverLayer } from './line-chart-hover'
import {
  COHORT_MIN_SPACES,
  COHORT_MONTHS,
  clampSeries,
  computeAxisMax,
  computeLineRuns,
  computeStackedColumns,
  computeWaterfall,
  buildCohortGrid,
} from './charts.logic'
import type {
  CohortGridRow,
  CohortRow,
  SeriesPoint,
  StackedCategory,
  WaterfallStep,
  WaterfallTone,
} from './charts.logic'

type Bar = { label: string; value: number; color?: string }

const COLORS = ['#7c6cf6', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#f0abfc']

/**
 * #1674.6 — 0 résumé textuel sur les 8 graphiques de ce fichier : chaque
 * valeur n'existait qu'au SURVOL (souris) ou dans un attribut `title` — ni
 * l'un ni l'autre n'est lu au clavier ni annoncé par un lecteur d'écran. Le
 * tracé décoratif (SVG ou grille de `<div>`) passe en `aria-hidden` — il ne
 * dit rien qu'un lecteur d'écran puisse utiliser SANS le résumé — et
 * `<Resume>` porte le texte complet à sa place. Même technique que
 * `.picker-sr` de `globals.css` (hors-flux, boîte de 1px, `clip` à zéro),
 * reprise ici en style inline pour ne pas sortir de ce fichier.
 */
const RESUME_VISUEL: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

/** Un résumé textuel, lu par tout lecteur d'écran, invisible à l'écran. */
function Resume({ texte }: { texte: string }) {
  return <p style={RESUME_VISUEL}>{texte}</p>
}

export function BarChart({
  data,
  format = v => String(v),
  height = 22,
}: {
  data: Bar[]
  format?: (v: number) => string
  height?: number
}) {
  const max = Math.max(1, ...data.map(d => d.value))
  // #1674.6 — chaque ligne affiche déjà son étiquette ET sa valeur en texte
  // normal (accessible) : la barre colorée est la seule partie décorative.
  // Le résumé donne juste le cadrage d'ensemble, sans dupliquer ce qui est
  // déjà lisible en dessous.
  const resume =
    data.length === 0
      ? 'Graphique en barres, aucune donnée.'
      : `Graphique en barres, ${data.length} valeur${data.length > 1 ? 's' : ''} : ` +
        data.map(d => `${d.label} ${format(d.value)}`).join(', ')
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <Resume texte={resume} />
      {data.map((d, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 64px', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {d.label}
          </span>
          <div style={{ background: 'var(--bg)', borderRadius: 6, overflow: 'hidden', height }}>
            <div
              style={{
                width: `${(d.value / max) * 100}%`,
                height: '100%',
                background: d.color ?? COLORS[i % COLORS.length],
                borderRadius: 6,
                minWidth: d.value > 0 ? 2 : 0,
              }}
            />
          </div>
          <span style={{ fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {format(d.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

// Timeline / sparkline — values over time (chronological points). Zero-dep SVG;
// non-uniform scale with a non-scaling stroke so the line stays crisp.
export function AreaChart({
  points,
  format = v => String(v),
  height = 130,
  color = '#7c6cf6',
}: {
  points: { label: string; value: number }[]
  format?: (v: number) => string
  height?: number
  color?: string
}) {
  if (points.length === 0) return null
  const W = 100
  const pad = 6
  const max = Math.max(1, ...points.map(p => p.value))
  const n = points.length
  const xOf = (i: number): number => (n > 1 ? (i / (n - 1)) * W : W / 2)
  const yOf = (v: number): number => height - pad - (v / max) * (height - 2 * pad)
  const line = points.map((p, i) => `${xOf(i).toFixed(2)},${yOf(p.value).toFixed(2)}`).join(' ')
  const area = `0,${height} ${line} ${W},${height}`
  const peak = points.reduce((m, p) => (p.value > m.value ? p : m), points[0])
  // #1674.6 — seuls le premier point, le pic et le dernier point étaient en
  // texte (pied de graphique) ; les points intermédiaires n'existaient que
  // sur le tracé. Le résumé donne la série complète.
  const resume = `Courbe, ${points.length} point${points.length > 1 ? 's' : ''} : ${points
    .map(p => `${p.label} ${format(p.value)}`)
    .join(', ')}. Pic : ${peak?.label ?? ''} ${peak ? format(peak.value) : ''}.`
  return (
    <div>
      <Resume texte={resume} />
      <svg aria-hidden="true" width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
        <polygon points={area} fill={color} opacity={0.14} />
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle key={i} cx={xOf(i)} cy={yOf(p.value)} r={1.6} fill={color} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}
      >
        <span>{points[0]?.label}</span>
        <span>pic {format(peak.value)}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  )
}

export function Donut({ segments, size = 132 }: { segments: Bar[]; size?: number }) {
  const sommeReelle = segments.reduce((s, x) => s + x.value, 0)
  const total = sommeReelle || 1
  const r = size / 2 - 12
  const c = 2 * Math.PI * r
  let offset = 0
  // #1674.6 — le total n'existait qu'en texte SVG (annonce inégale selon le
  // lecteur d'écran) ; la répartition, elle, est déjà dans la légende en
  // dessous (texte normal, déjà accessible) — le résumé ne la répète donc
  // pas mot pour mot, il ajoute juste le total en clair.
  const resume =
    sommeReelle === 0
      ? 'Diagramme circulaire, aucune donnée.'
      : `Diagramme circulaire, total ${sommeReelle} : ${segments.map(s => `${s.label} ${s.value}`).join(', ')}.`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      <Resume texte={resume} />
      <svg aria-hidden="true" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {segments.map((s, i) => {
            const frac = s.value / total
            const dash = frac * c
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color ?? COLORS[i % COLORS.length]}
                strokeWidth={16}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
              />
            )
            offset += dash
            return el
          })}
        </g>
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--text)"
          fontSize="22"
          fontWeight="700"
        >
          {total}
        </text>
      </svg>
      <div style={{ display: 'grid', gap: 4 }}>
        {segments.map((s, i) => (
          <span key={i} style={{ fontSize: 13, color: 'var(--muted)' }}>
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: 3,
                background: s.color ?? COLORS[i % COLORS.length],
                marginRight: 8,
              }}
            />
            {s.label} · {s.value}
          </span>
        ))}
      </div>
    </div>
  )
}

// A 0..1 (or 0..100) confidence gauge.
export function Gauge({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, value))
  const color = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--red)'
  return (
    <div>
      {label ? null : (
        // #1674.6 — sans `label`, la jauge ne rendait RIEN de textuel : ni
        // valeur ni nom, seulement une barre colorée. Quand `label` existe,
        // le texte visible juste en dessous suffit déjà (pas de doublon).
        <Resume texte={`Jauge : ${Math.round(pct)} %.`} />
      )}
      <div aria-hidden="true" style={{ background: 'var(--bg)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color }} />
      </div>
      {label ? (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          {label} · {Math.round(pct)}
        </div>
      ) : null}
    </div>
  )
}

// A footer every #1643 chart carries: its PERIOD and its CALCULATION DATE
// (« Tout graphique porte sa PÉRIODE et sa DATE DE CALCUL en pied »).
function ChartFooter({ period, asOf }: { period: string; asOf: string }) {
  return (
    <div
      style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 6 }}
    >
      <span>{period}</span>
      <span>calculé le {asOf}</span>
    </div>
  )
}

/**
 * #1643 — LineChart : multi-séries (max 5), tooltip au survol, ligne
 * verticale de repère.
 *
 * Aucune valeur inventée entre deux points : un trou dans une série (mois
 * sans donnée) COUPE la ligne en deux tronçons plutôt que de la relier —
 * `computeLineRuns` (testé exhaustivement dans `charts.logic.test.ts`) fait
 * cette découpe, ce composant se contente de la dessiner.
 */
export function LineChart({
  series,
  period,
  asOf,
  height = 160,
  format = v => String(v),
}: {
  series: ReadonlyArray<{ name: string; points: SeriesPoint[] }>
  period: string
  asOf: string
  height?: number
  format?: (v: number) => string
}) {
  const clamped = clampSeries(series)
  const W = 100
  const pad = 6
  const n = clamped[0]?.points.length ?? 0
  const max = computeAxisMax(clamped.map(s => s.points.map(p => p.value)))

  const geometry = clamped.map((s, i) => ({
    name: s.name,
    color: COLORS[i % COLORS.length] as string,
    runs: computeLineRuns(
      s.points.map(p => p.value),
      { width: W, height, pad, max },
    ),
    // Formaté ICI, côté serveur : une fonction ne traverse pas la frontière
    // RSC vers `LineChartHoverLayer` (Client Component), une chaîne oui.
    formatted: s.points.map(p => (p.value == null ? null : format(p.value))),
    labels: s.points.map(p => p.label),
  }))

  // #1674.6 — les valeurs n'existaient qu'au SURVOL (`LineChartHoverLayer`
  // est à la souris uniquement, sans équivalent clavier) : rien de la série
  // n'était dans le DOM au repos. Le résumé porte la série complète, point
  // par point — la même granularité que le survol, pour tout le monde.
  const resume = geometry
    .map(s => `${s.name} : ` + s.labels.map((label, i) => `${label} ${s.formatted[i] ?? 'non mesuré'}`).join(', '))
    .join(' — ')

  return (
    <div>
      <Resume texte={resume || 'Courbe, aucune donnée.'} />
      {/* Le tracé lui-même (et son survol, à la souris uniquement) est
          décoratif une fois le résumé donné : `aria-hidden` évite qu'un
          lecteur d'écran tente d'en tirer un sens sans lui. */}
      <div aria-hidden="true">
        <LineChartHoverLayer width={W} height={height} n={n} series={geometry}>
          {geometry.map(s => (
            <g key={s.name}>
              {s.runs.map((run, ri) =>
                run.length > 1 ? (
                  <polyline
                    key={ri}
                    points={run.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                  />
                ) : (
                  // Un run d'un seul point (encadré de trous des deux côtés) :
                  // un point isolé, jamais relié à rien.
                  <circle
                    key={ri}
                    cx={run[0]?.x}
                    cy={run[0]?.y}
                    r={1.8}
                    fill={s.color}
                    vectorEffect="non-scaling-stroke"
                  />
                ),
              )}
            </g>
          ))}
        </LineChartHoverLayer>
      </div>
      {clamped.length > 1 ? (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
          {geometry.map(s => (
            <span key={s.name}>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: s.color,
                  marginRight: 6,
                }}
              />
              {s.name}
            </span>
          ))}
        </div>
      ) : null}
      <ChartFooter period={period} asOf={asOf} />
    </div>
  )
}

/**
 * #1643 — StackedBar : empilé, pour la décomposition du MRR (ou de toute
 * autre grandeur composée de parts non négatives). Une catégorie totalement
 * non mesurée n'affiche pas une colonne à 0 : elle disparaît au profit d'un
 * repère en pointillés, avec l'explication au survol.
 */
export function StackedBar({
  categories,
  keys,
  labels,
  period,
  asOf,
  height = 160,
  format = v => String(v),
}: {
  categories: readonly StackedCategory[]
  keys: readonly string[]
  labels?: Readonly<Record<string, string>>
  period: string
  asOf: string
  height?: number
  format?: (v: number) => string
}) {
  const clampedKeys = clampSeries(keys)
  const columns = computeStackedColumns(categories, clampedKeys)
  const max = Math.max(1, ...columns.map(c => c.total ?? 0))
  const colorOf = (key: string): string => {
    const i = clampedKeys.indexOf(key)
    return COLORS[i % COLORS.length] as string
  }

  // #1674.6 — chaque colonne ne portait sa valeur que dans un `title` (lu au
  // survol souris, jamais au clavier). Le résumé porte le détail complet,
  // catégorie non mesurée comprise — jamais rendue « 0 ».
  const resume = columns
    .map(col => {
      if (col.total == null) return `${col.label} : non mesuré`
      const detail = col.segments.map(seg => `${labels?.[seg.key] ?? seg.key} ${format(seg.value)}`).join(', ')
      return `${col.label} total ${format(col.total)} (${detail})`
    })
    .join(' ; ')

  return (
    <div>
      <Resume texte={`Barres empilées : ${resume || 'aucune donnée'}.`} />
      <div aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height }}>
        {columns.map(col => (
          <div
            key={col.label}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}
          >
            {col.total == null ? (
              <div
                style={{ height: 4, borderRadius: 3, border: '1px dashed var(--border)' }}
                title={`${col.label} · non mesuré`}
              />
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column-reverse',
                  height: `${(col.total / max) * 100}%`,
                  minHeight: 2,
                  borderRadius: 3,
                  overflow: 'hidden',
                }}
              >
                {col.segments.map(seg => (
                  <div
                    key={seg.key}
                    // Une part négative (ex. churn) ne creuse pas la pile : elle
                    // ne contribue pas de hauteur visuelle plutôt que de rendre
                    // une hauteur négative. C'est WaterfallChart qui montre le
                    // solde signé, pas cette pile.
                    style={{
                      height: `${(Math.max(0, seg.value) / (col.total || 1)) * 100}%`,
                      background: colorOf(seg.key),
                    }}
                    title={`${labels?.[seg.key] ?? seg.key} · ${format(seg.value)}`}
                  />
                ))}
              </div>
            )}
            <span style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', marginTop: 4 }}>{col.label}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
        {clampedKeys.map(k => (
          <span key={k}>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: 2,
                background: colorOf(k),
                marginRight: 6,
              }}
            />
            {labels?.[k] ?? k}
          </span>
        ))}
      </div>
      <ChartFooter period={period} asOf={asOf} />
    </div>
  )
}

const WATERFALL_TONE_VAR: Record<WaterfallTone, string> = {
  positive: 'var(--green)',
  negative: 'var(--red)',
  neutral: 'var(--blue)',
  unknown: 'var(--muted)',
}

/**
 * #1643 — WaterfallChart : « nouveau MRR = début + new + expansion −
 * contraction − churn ». Chaque barre flotte sur le total courant ; une
 * étape non mesurée ne dessine pas de barre et NE FAIT PAS avancer le total
 * (`computeWaterfall`, testé exhaustivement) — le deviner à 0 décalerait
 * silencieusement toutes les barres suivantes.
 */
export function WaterfallChart({
  steps,
  period,
  asOf,
  height = 160,
  format = v => String(v),
}: {
  steps: readonly WaterfallStep[]
  period: string
  asOf: string
  height?: number
  format?: (v: number) => string
}) {
  const bars = computeWaterfall(steps)
  const ys = bars.flatMap(b => [b.y0, b.y1])
  const domainMax = Math.max(1, ...ys)
  const domainMin = Math.min(0, ...ys)
  const span = Math.max(1, domainMax - domainMin)
  const scale = (y: number): number => ((y - domainMin) / span) * 100

  // #1674.6 — chaque barre ne portait sa valeur que dans un `title` (souris
  // uniquement). Le résumé porte le détail complet, étape par étape.
  const resume = bars.map(bar => `${bar.label} ${bar.value != null ? format(bar.value) : 'non mesuré'}`).join(', ')

  return (
    <div>
      <Resume texte={`Cascade : ${resume || 'aucune donnée'}.`} />
      <div aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height }}>
        {bars.map(bar => {
          const bottomPct = scale(bar.y0)
          const topPct = scale(bar.y1)
          const heightPct = Math.max(0, topPct - bottomPct)
          return (
            <div
              key={bar.label}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}
            >
              {bar.tone === 'unknown' ? (
                <div
                  style={{ marginBottom: `${bottomPct}%`, borderTop: '2px dashed var(--muted)' }}
                  title={`${bar.label} · non mesuré`}
                />
              ) : (
                <div
                  style={{
                    marginBottom: `${bottomPct}%`,
                    height: `${heightPct}%`,
                    minHeight: heightPct > 0 ? 2 : 0,
                    borderRadius: 3,
                    background: WATERFALL_TONE_VAR[bar.tone],
                  }}
                  title={`${bar.label} · ${bar.value != null ? format(bar.value) : 'non mesuré'}`}
                />
              )}
              <span style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', marginTop: 4 }}>
                {bar.label}
              </span>
            </div>
          )
        })}
      </div>
      <ChartFooter period={period} asOf={asOf} />
    </div>
  )
}

const COHORT_INTENSITY_OPACITY = [0.14, 0.34, 0.54, 0.74, 1]

/**
 * #1643 — CohortGrid : rétention par cohorte mensuelle, 12 colonnes. Une
 * cohorte de moins de 3 espaces n'est pas affichée (anonymat) ; une cellule
 * future est VIDE, pas 0 ; une cellule déjà dans la fenêtre mais sans donnée
 * est marquée non mesurée, distincte des deux (`buildCohortGrid`, testé
 * exhaustivement dans `charts.logic.test.ts`).
 */
export function CohortGrid({
  rows,
  monthsElapsed,
  period,
  asOf,
  format = v => `${Math.round(v * 100)} %`,
}: {
  rows: readonly CohortRow[]
  monthsElapsed: (row: CohortRow) => number
  period: string
  asOf: string
  format?: (v: number) => string
}) {
  const grid = buildCohortGrid(rows, monthsElapsed)
  const visible = grid.filter((g): g is CohortGridRow => g !== null)
  const domain = intensityDomain(visible.flatMap(g => g.cells.map(c => c.value)))

  if (visible.length === 0) {
    return (
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>
        Aucune cohorte assez grande pour être affichée (anonymat, minimum {COHORT_MIN_SPACES} espaces).
      </p>
    )
  }

  // #1674.6 — chaque cellule ne portait sa valeur que dans un `title`
  // (souris uniquement). Le résumé porte, par cohorte, chaque mois déjà
  // écoulé — MESURÉ ou explicitement NON MESURÉ, jamais confondus — et tait
  // les mois futurs (rien à en dire, comme la cellule vide qui les représente).
  const resume = visible
    .map(row => {
      const detail = row.cells
        .map((cell, m) => {
          if (cell.state === 'future') return null
          if (cell.state === 'unmeasured' || cell.value == null) return `M${m} non mesuré`
          return `M${m} ${format(cell.value)}`
        })
        .filter((s): s is string => s != null)
        .join(', ')
      return `${row.cohortLabel} : ${detail || 'aucune donnée'}`
    })
    .join(' ; ')

  return (
    <div>
      <Resume texte={`Grille de cohortes : ${resume}.`} />
      <div
        aria-hidden="true"
        style={{ display: 'grid', gridTemplateColumns: `88px repeat(${COHORT_MONTHS}, 1fr)`, gap: 3 }}
      >
        <span />
        {Array.from({ length: COHORT_MONTHS }, (_, m) => (
          <span key={m} style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center' }}>
            M{m}
          </span>
        ))}
        {visible.map(row => (
          <Fragment key={row.cohortLabel}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{row.cohortLabel}</span>
            {row.cells.map((cell, m) => {
              if (cell.state === 'future') return <span key={m} />
              if (cell.state === 'unmeasured' || cell.value == null || !domain) {
                return (
                  <span
                    key={m}
                    style={{ aspectRatio: '1', borderRadius: 3, border: '1px dashed var(--border)' }}
                    title={`${row.cohortLabel} · M${m} · non mesuré`}
                  />
                )
              }
              const intensity = computeIntensity(cell.value, domain.min, domain.max)
              return (
                <span
                  key={m}
                  style={{
                    aspectRatio: '1',
                    borderRadius: 3,
                    background: 'var(--accent)',
                    opacity: intensity == null ? 0 : COHORT_INTENSITY_OPACITY[intensity],
                  }}
                  title={`${row.cohortLabel} · M${m} · ${format(cell.value)}`}
                />
              )
            })}
          </Fragment>
        ))}
      </div>
      <ChartFooter period={period} asOf={asOf} />
    </div>
  )
}
