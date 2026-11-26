// #1642 — SegmentBar : « barre segmentée avec légende — le motif Financia ».
// La décision pure : les largeurs en % à partir des valeurs, et ce que « rien
// à répartir » veut dire (total nul ou négatif → non mesuré, PAS une barre
// remplie à 0 partout qui prétendrait une mesure).

export type Segment = { label: string; value: number; color?: string }
type SegmentSlice = Segment & { pct: number }

export function computeSegments(segments: readonly Segment[]): { slices: SegmentSlice[]; total: number | null } {
  const total = segments.reduce((sum, s) => sum + (Number.isFinite(s.value) && s.value > 0 ? s.value : 0), 0)

  if (segments.length === 0 || total <= 0) {
    return { slices: segments.map(s => ({ ...s, pct: 0 })), total: null }
  }

  return {
    slices: segments.map(s => ({ ...s, pct: Number.isFinite(s.value) && s.value > 0 ? (s.value / total) * 100 : 0 })),
    total,
  }
}
