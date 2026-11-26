import { describe, expect, it } from 'vitest'
import { saveTeamReviewSchema } from './team-review.js'

const decision = {
  topic_id: 'late:11111111-1111-4111-8111-111111111111',
  account_id: '22222222-2222-4222-8222-222222222222',
  label: 'Obtenir le bon de commande avant le démarrage',
  owner_id: '33333333-3333-4333-8333-333333333333',
  due_date: '2026-10-23',
  reason: 'L’échéance de cette action est dépassée.',
}

describe('Théo D team-review.N1 — saveTeamReviewSchema', () => {
  it('accepte un point avec ses décisions', () => {
    expect(saveTeamReviewSchema.safeParse({ decisions: [decision] }).success).toBe(true)
  })

  it('accepte une action existante à mettre à jour (existing_item_id)', () => {
    const parsed = saveTeamReviewSchema.parse({
      decisions: [{ ...decision, existing_item_id: '44444444-4444-4444-8444-444444444444' }],
    })
    expect(parsed.decisions[0]?.existing_item_id).toBe('44444444-4444-4444-8444-444444444444')
  })

  it('« Point sans nouvelle action » : aucune décision, une note suffit (team-review.N3)', () => {
    const parsed = saveTeamReviewSchema.parse({ decisions: [], no_new_action: true, note: 'On en reparle jeudi.' })
    expect(parsed.no_new_action).toBe(true)
  })

  it('refuse un point sans décision ni « sans nouvelle action » : rien à enregistrer', () => {
    expect(saveTeamReviewSchema.safeParse({ decisions: [] }).success).toBe(false)
  })

  it('refuse « sans nouvelle action » AVEC des décisions : le point se contredirait', () => {
    expect(saveTeamReviewSchema.safeParse({ decisions: [decision], no_new_action: true }).success).toBe(false)
  })

  it('refuse une échéance qui n’est pas une date, un libellé vide, trop de décisions', () => {
    expect(saveTeamReviewSchema.safeParse({ decisions: [{ ...decision, due_date: 'demain' }] }).success).toBe(false)
    expect(saveTeamReviewSchema.safeParse({ decisions: [{ ...decision, label: '  ' }] }).success).toBe(false)
    expect(saveTeamReviewSchema.safeParse({ decisions: Array(21).fill(decision) }).success).toBe(false)
  })
})
