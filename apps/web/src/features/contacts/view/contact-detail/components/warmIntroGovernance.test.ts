import { describe, expect, it } from 'vitest'
import {
  RELATION_STALE_AFTER_DAYS,
  canCiteReferrer,
  describeIntroPath,
  needsRequalification,
} from './warmIntroGovernance'

describe('canCiteReferrer — jamais « de la part de X » sans accord VÉRIFIÉ', () => {
  it('refuse tant que le référent n’a pas confirmé, même un lien vérifié et citable', () => {
    expect(canCiteReferrer({ linkKind: 'explicit_recommendation', verified: true, referrerConfirmed: false })).toBe(
      false,
    )
  })

  it('refuse un lien non vérifié, même si quelqu’un dit avoir confirmé', () => {
    expect(canCiteReferrer({ linkKind: 'explicit_recommendation', verified: false, referrerConfirmed: true })).toBe(
      false,
    )
  })

  it('refuse toujours une simple homonymie ou une relation probable, même « confirmée »', () => {
    expect(canCiteReferrer({ linkKind: 'plain_homonymy', verified: true, referrerConfirmed: true })).toBe(false)
    expect(canCiteReferrer({ linkKind: 'probable_relation', verified: true, referrerConfirmed: true })).toBe(false)
  })

  it('accepte un lien vérifié, citable, ET confirmé par le référent', () => {
    expect(canCiteReferrer({ linkKind: 'explicit_recommendation', verified: true, referrerConfirmed: true })).toBe(true)
  })
})

// #2373.8 — chemin possible vs accord confirmé.
describe('describeIntroPath — « chemin possible » n’est jamais confondu avec « accord confirmé »', () => {
  it('rend potential_path tant que le référent n’a pas confirmé', () => {
    expect(describeIntroPath({ referrerConfirmed: false })).toBe('potential_path')
  })

  it('rend confirmed_agreement une fois la confirmation obtenue', () => {
    expect(describeIntroPath({ referrerConfirmed: true })).toBe('confirmed_agreement')
  })
})

// #2373.7 — une relation ancienne se requalifie avant d'être réutilisée.
describe('needsRequalification — une relation ANCIENNE ne se réutilise pas telle quelle', () => {
  it('ne demande rien pour une relation jamais autorisée (pas un cas de RÉUTILISATION)', () => {
    expect(needsRequalification({ lastAuthorizedAt: null, today: '2026-09-22' })).toBe(false)
  })

  it(`ne demande rien sous le seuil de ${RELATION_STALE_AFTER_DAYS} jours`, () => {
    expect(needsRequalification({ lastAuthorizedAt: '2026-06-01', today: '2026-09-22' })).toBe(false)
  })

  it(`demande une requalification au-delà de ${RELATION_STALE_AFTER_DAYS} jours`, () => {
    expect(needsRequalification({ lastAuthorizedAt: '2025-01-01', today: '2026-09-22' })).toBe(true)
  })
})
