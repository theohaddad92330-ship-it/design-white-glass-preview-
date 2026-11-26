// #1642 — Sparkline : « barres verticales fines — le motif Financia ». Même
// doctrine que les graphiques de #1643 : un point non mesuré est un trou
// visible (barre absente), jamais une barre à hauteur 0 qui prétendrait une
// vraie valeur nulle.

export type SparkPoint = { value: number | null }
type SparkBar = { heightPct: number; missing: boolean }

export function computeSparkBars(points: readonly SparkPoint[]): SparkBar[] {
  const known = points.map(p => p.value).filter((v): v is number => v != null && Number.isFinite(v))
  const max = known.length ? Math.max(0, ...known) : 0

  return points.map(p => {
    if (p.value == null || !Number.isFinite(p.value)) return { heightPct: 0, missing: true }
    if (max <= 0) return { heightPct: 0, missing: false }
    return { heightPct: Math.max(0, Math.min(100, (p.value / max) * 100)), missing: false }
  })
}
