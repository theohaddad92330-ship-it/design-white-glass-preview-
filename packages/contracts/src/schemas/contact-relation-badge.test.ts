import { describe, expect, it } from 'vitest'
import { deriveContactRelationBadge } from './contact-relation-badge.js'
import type { RelationActivityInput } from './contact-relation-summary.js'

const NOW = new Date('2026-10-22T10:00:00Z')

function act(
  partial: Partial<RelationActivityInput> & Pick<RelationActivityInput, 'id' | 'occurredAt'>,
): RelationActivityInput {
  return { kind: 'email', direction: 'outbound', verdict: 'sent', outcome: null, ...partial }
}

// Théo B C5.R2 / C1.N2 — le badge « Échange engagé » est DÉRIVÉ de l'historique ; la déclaration humaine gagne.
describe('deriveContactRelationBadge', () => {
  it('sans activité ni déclaration : « à contacter », dérivé', () => {
    expect(deriveContactRelationBadge({ activities: [], declaredStatus: null, now: NOW })).toEqual({
      derived: 'to_contact',
      declared: null,
      shown: { source: 'derived', relation: 'to_contact' },
    })
  })

  it('un e-mail envoyé sans réponse est une tentative : toujours « à contacter »', () => {
    const badge = deriveContactRelationBadge({
      activities: [act({ id: 'a', occurredAt: '2026-10-10T09:00:00Z' })],
      declaredStatus: 'new',
      now: NOW,
    })
    expect(badge.derived).toBe('to_contact')
  })

  it('une réponse entrante est un échange réel : « échange engagé »', () => {
    const badge = deriveContactRelationBadge({
      activities: [act({ id: 'a', direction: 'inbound', occurredAt: '2026-10-12T09:00:00Z' })],
      declaredStatus: null,
      now: NOW,
    })
    expect(badge.shown).toEqual({ source: 'derived', relation: 'engaged' })
  })

  it('un appel abouti compte, une messagerie non', () => {
    const base = { kind: 'call', occurredAt: '2026-10-12T09:00:00Z' } as const
    const reached = deriveContactRelationBadge({
      activities: [act({ id: 'a', ...base, outcome: 'connected_qualified' })],
      declaredStatus: null,
      now: NOW,
    })
    const voicemail = deriveContactRelationBadge({
      activities: [act({ id: 'b', ...base, outcome: 'voicemail' })],
      declaredStatus: null,
      now: NOW,
    })
    expect(reached.derived).toBe('engaged')
    expect(voicemail.derived).toBe('to_contact')
  })

  it('la déclaration humaine gagne, même contre un échange dérivé', () => {
    const badge = deriveContactRelationBadge({
      activities: [act({ id: 'a', direction: 'inbound', occurredAt: '2026-10-12T09:00:00Z' })],
      declaredStatus: 'refused',
      now: NOW,
    })
    expect(badge.derived).toBe('engaged')
    expect(badge.declared).toBe('refused')
    expect(badge.shown).toEqual({ source: 'declared', status: 'refused' })
  })

  it('le statut par défaut « new » n’est pas une déclaration', () => {
    expect(deriveContactRelationBadge({ activities: [], declaredStatus: 'new', now: NOW }).declared).toBeNull()
  })
})
