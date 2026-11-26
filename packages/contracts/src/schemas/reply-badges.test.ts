import { describe, expect, it } from 'vitest'
import {
  REPLY_BADGES_MAX,
  REPLY_BADGE_CODES,
  REPLY_BADGE_TONES,
  REPLY_LABEL_FAMILIES,
  deriveReplyBadges,
} from './reply-badges.js'

const now = new Date('2026-10-06T10:00:00.000Z')

describe('#3764 — badges des réponses de Laura', () => {
  it('chaque badge a un ton, et les quatre familles existent (la complétude n’en est plus une, #3764)', () => {
    expect(REPLY_BADGE_CODES).toHaveLength(10)
    for (const code of REPLY_BADGE_CODES) expect(REPLY_BADGE_TONES[code]).toBeTruthy()
    expect(Object.keys(REPLY_LABEL_FAMILIES)).toEqual(['confidence', 'freshness', 'proof', 'action'])
  })

  it('même situation, mêmes badges', () => {
    const situation = { oldestAsOf: '2026-01-01', sourceCount: 2, toolsRead: true, now }
    expect(deriveReplyBadges(situation)).toEqual(deriveReplyBadges({ ...situation }))
  })

  it('une source récente = signal actuel vérifié ; une vieille = signal historique', () => {
    expect(deriveReplyBadges({ oldestAsOf: '2026-09-25', now }).badges).toEqual(['current_signal_verified'])
    expect(deriveReplyBadges({ oldestAsOf: '2026-09-25', now }).freshness).toBe('current')
    expect(deriveReplyBadges({ oldestAsOf: '2025-12-01', now }).badges).toEqual(['historical_signal'])
    expect(deriveReplyBadges({ oldestAsOf: '2026-06-01', now }).freshness).toBe('recent')
  })

  it("aucune lecture d'outil : aucune preuve actuelle, jamais « actuel vérifié »", () => {
    const out = deriveReplyBadges({ oldestAsOf: '2026-09-25', toolsRead: false, now })
    expect(out.badges).toEqual(['no_current_proof'])
  })

  // #4071.3 (recette R6 14/10) — les faits du compte / la mémoire de l'espace sont
  // injectés server-side (jamais par un appel d'outil) : « aucun outil lu » ne doit
  // pas dire « aucune preuve actuelle » quand l'un des deux a réellement été lu.
  it("aucune lecture d'outil MAIS des faits/une mémoire d'espace lus : aucune « preuve actuelle » manquante", () => {
    const out = deriveReplyBadges({ oldestAsOf: '2026-09-25', toolsRead: false, contextFactsRead: true, now })
    expect(out.badges).not.toContain('no_current_proof')
  })

  it('une valeur absente ne produit AUCUN badge', () => {
    expect(deriveReplyBadges({ now })).toEqual({ badges: [], freshness: null })
    expect(deriveReplyBadges({ oldestAsOf: 'pas une date', sourceCount: null, toolsRead: null, now }).badges).toEqual(
      [],
    )
  })

  it('cartographie partielle : un badge, pas de doublon « à qualifier »', () => {
    const out = deriveReplyBadges({ mappingPartial: true, notConsultedCount: 3, now })
    expect(out.badges).toEqual(['mapping_partial'])
  })

  it('jamais plus de trois badges, les plus utiles d’abord', () => {
    const out = deriveReplyBadges({
      toolsRead: false,
      mappingPartial: true,
      scopeUnconfirmed: true,
      pendingAction: true,
      oldestAsOf: '2024-01-01',
      now,
    })
    expect(out.badges).toHaveLength(REPLY_BADGES_MAX)
    expect(out.badges).toEqual(['no_current_proof', 'mapping_partial', 'scope_to_confirm'])
  })

  // #3764 gagne sur #3861.3 (Louis, 11/10) : la « Complétude » n'est JAMAIS une étiquette de réponse.
  // Ce test échoue si la dérivation en reporte une, sous quelque situation que ce soit.
  it("aucune situation ne produit d'étiquette de complétude", () => {
    const situations = [
      { now },
      { mappingPartial: true, now },
      { notConsultedCount: 2, now },
      { toolsRead: true, sourceCount: 4, notConsultedCount: 0, now },
    ]
    for (const situation of situations) {
      expect(Object.keys(deriveReplyBadges(situation)).sort()).toEqual(['badges', 'freshness'])
    }
  })
})
