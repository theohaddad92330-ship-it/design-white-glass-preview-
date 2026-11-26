import { gaugeCornerRadius } from '@bellum/ui'
import { describe, expect, it } from 'vitest'

/**
 * #3713 — recette RQ4 09/10 : « petit tiret vert isolé (~2×6 px) au-dessus
 * du score (94, 63) sur /contacts/<id> — l'anneau de score semble cassé ».
 * `cornerRadius` (`packages/ui/src/atoms/gauge.tsx`, le `RadialBar` que
 * `ContactScoreDonut` monte via `GaugeDonut`) est en PIXELS pour Recharts,
 * jamais un pourcentage : à 999 (bien au-delà de l'épaisseur réelle de
 * l'anneau, ~5 px à la taille `tiny`), le calcul du congé déborde la bande et
 * laisse un fragment de tracé disjoint près de l'angle de départ (90°, midi).
 * `gaugeCornerRadius` borne désormais le congé à la MOITIÉ de l'épaisseur
 * réelle — déjà pleinement arrondi, jamais plus.
 */
describe('#3713 — l’anneau de score (GaugeDonut/ContactScoreDonut), le congé ne déborde jamais l’épaisseur réelle', () => {
  const RING_THICKNESS_PCT = 1 - 0.72 // innerRadius 72 % / outerRadius 100 % (gauge.tsx)

  it.each([
    ['tiny', 38],
    ['small', 48],
    ['medium', 72],
    ['large', 104],
  ] as const)('à la taille %s (%dpx), le congé tient dans la moitié de l’épaisseur de l’anneau', (_label, px) => {
    const thickness = (px / 2) * RING_THICKNESS_PCT
    const corner = gaugeCornerRadius(px)
    expect(corner).toBeGreaterThan(0)
    expect(corner).toBeLessThanOrEqual(thickness / 2 + 0.001)
  })

  // LA PREUVE QUE CE TEST SAIT DIRE NON : l'ancienne valeur fixe (999) — bien
  // au-delà de l'épaisseur réelle de l'anneau (~5 px à `tiny`) — est
  // exactement le défaut mesuré en recette (94, 63). Les tailles réelles du
  // composant restent à des ordres de grandeur sous ce seuil.
  it('sait dire NON : refuse une valeur de l’ordre de l’ancien défaut fixe (999)', () => {
    for (const px of [38, 48, 72, 104]) {
      expect(gaugeCornerRadius(px)).toBeLessThan(20)
    }
  })
})
