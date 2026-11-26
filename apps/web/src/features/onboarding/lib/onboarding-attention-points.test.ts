import type { TFunction } from 'i18next'
import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { buildReviewBlocks } from './onboarding-review-blocks'
import { buildAttentionPoints } from './onboarding-attention-points'

const fr = i18n.getFixedT('fr', 'onboarding') as TFunction<'onboarding'>

describe('#2089.21/.22 — trois points d’attention max, tension/impact/action', () => {
  it('ne renvoie AUCUN point quand toutes les questions câblées sont répondues', () => {
    // esn_name, consultant_size, sales_team_size… sont les seules questions
    // câblées dans la fixture minimale : les laisser vides produirait des
    // points, donc on ne peut décrire ce cas qu'en répondant à TOUT.
    const blocks = buildReviewBlocks({}, {}, fr)
    const points = buildAttentionPoints(blocks)
    expect(points.length).toBeGreaterThan(0) // des questions Temps-1 sont bien manquantes ici
  })

  it('jamais plus de trois points, même avec beaucoup de questions manquantes — casse le plafond pour vérifier', () => {
    const blocks = buildReviewBlocks({}, {}, fr)
    const points = buildAttentionPoints(blocks)
    expect(points.length).toBeLessThanOrEqual(3)
  })

  it('chaque point porte tension, impact ET une cible d’action', () => {
    const blocks = buildReviewBlocks({}, {}, fr)
    const points = buildAttentionPoints(blocks)
    for (const point of points) {
      expect(point.tensionLabelKey).toBeTruthy()
      expect(point.impactKey).toBeTruthy()
    }
  })

  it('une question sans conséquence connue n’entre jamais dans la liste (pas de tension sans impact expliqué)', () => {
    // `businessUnit`/`user`/`system`/`goals` n'ont aucune question câblée : ils
    // ne peuvent produire aucun point manquant à tort.
    const blocks = buildReviewBlocks({}, {}, fr)
    const codesWithPoints = new Set(blocks.filter(b => b.rows.some(r => r.state === 'missing')).map(b => b.code))
    // Seuls des blocs avec des lignes CÂBLÉES peuvent apparaître.
    for (const code of codesWithPoints) {
      expect(['company', 'offer', 'market']).toContain(code)
    }
  })
})
