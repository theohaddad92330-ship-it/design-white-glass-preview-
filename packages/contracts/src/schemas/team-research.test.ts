import { describe, expect, it } from 'vitest'
import { recordTeamResearchSchema, teamResearchItemSchema } from './team-research.js'

describe('team-research — contrat', () => {
  it('une absence de comptes reste null, jamais 0', () => {
    const item = teamResearchItemSchema.parse({
      id: 'r1',
      kind: 'discover',
      occurred_at: '2026-10-19T08:00:00.000Z',
      title: 'Banque & assurance · Lyon',
      scope_label: null,
      account_count: null,
      open_action_count: 0,
      next_action: null,
      author_user_id: null,
      author_name: null,
      account_id: null,
      filters: { city: 'Lyon' },
    })
    expect(item.account_count).toBeNull()
  })

  it('refuse une recherche sans titre', () => {
    expect(recordTeamResearchSchema.safeParse({ title: '  ', filters: {} }).success).toBe(false)
  })
})
