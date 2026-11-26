import { describe, expect, it } from 'vitest'
import {
  LINK_KINDS,
  RELATIONAL_WARMTHS,
  isLinkKindCitable,
  linkKindSchema,
  relationalWarmthSchema,
} from './link-kind.js'

/**
 * #2373.2 / #3403.7-.10 — LES TREIZE TYPES DE LIEN, ET SEULS LES VÉRIFIÉS SONT
 * CITABLES.
 *
 * LAU-FINAL-088 nommait dix types de lien personnel (recommandation explicite,
 * introduction proposée, relation commune, ancien collègue, consultant,
 * collègue du workspace, interaction LinkedIn, contact historique, relation
 * probable, simple homonymie) ; le retour #3403 en ajoute trois, ADDITIFS
 * (ancien manager, événement ou rencontre, réseau alumni). Une seule règle :
 * « seuls les liens vérifiés peuvent être cités ». `relation probable` et
 * `simple homonymie` ne deviennent JAMAIS citables, quel que soit l'état de
 * vérification — ce sont, par construction, des liens NON confirmés.
 */

describe('#2373.2 / #3403 — treize types, et treize seulement', () => {
  it('porte exactement treize types de lien', () => {
    expect(LINK_KINDS).toHaveLength(13)
  })

  it('valide chaque type déclaré', () => {
    for (const kind of LINK_KINDS) {
      expect(linkKindSchema.safeParse(kind).success).toBe(true)
    }
  })

  it('refuse un type inventé', () => {
    expect(linkKindSchema.safeParse('lien_invente').success).toBe(false)
  })
})

describe('#2373.2 — seuls les liens vérifiés sont citables', () => {
  it('un lien non vérifié ne se cite jamais, quel que soit son type', () => {
    for (const kind of LINK_KINDS) {
      expect(isLinkKindCitable(kind, false)).toBe(false)
    }
  })

  it('un lien vérifié se cite, sauf relation probable et simple homonymie', () => {
    for (const kind of LINK_KINDS) {
      const expected = kind !== 'probable_relation' && kind !== 'plain_homonymy'
      expect(isLinkKindCitable(kind, true)).toBe(expected)
    }
  })
})

describe('#3403.12 — chaleur relationnelle, déclarée par un humain', () => {
  it('trois niveaux fermés, jamais une note chiffrée', () => {
    expect(RELATIONAL_WARMTHS).toEqual(['distant', 'cordial', 'close'])
    expect(relationalWarmthSchema.safeParse('close').success).toBe(true)
    expect(relationalWarmthSchema.safeParse(7).success).toBe(false)
    expect(relationalWarmthSchema.safeParse('tiede').success).toBe(false)
  })
})
