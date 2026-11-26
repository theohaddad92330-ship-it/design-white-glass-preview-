import { describe, expect, it } from 'vitest'
import { ACTION_TARGET_KINDS, actionOwnerPage } from './action-plan-items.js'
import { commercialTensionRuleIdValues, type AuditContradiction } from './commercial-audit-context.js'
import {
  AUDIT_MOVE_KINDS,
  AUDIT_MOVE_KIND_BY_RULE,
  AUDIT_MOVE_STATUSES,
  AUDIT_MOVE_TARGET_BY_RULE,
  MAX_AUDIT_MOVES,
  auditMovePage,
  auditMoveSchema,
  auditMovesFrom,
} from './commercial-audit-moves.js'

/**
 * #2074.10 à #2074.15 / #2090.7 — LES PREMIERS MOUVEMENTS.
 *
 * Le contrat existe pour qu'un écran puisse rendre, à la fin de l'audit, AU
 * PLUS trois gestes — et ces tests sont là d'abord pour savoir dire NON : à un
 * mouvement sans objet, à un genre inventé, à une règle de tension qui
 * n'aurait pas été classée, à une page BellumAI devinée.
 */

function contradiction(overrides: Partial<AuditContradiction> = {}): AuditContradiction {
  return {
    ruleId: 'tooManySimultaneousMarkets',
    facts: ['4 secteurs visés'],
    tension: 'Quatre secteurs visés pour une seule personne à temps partiel.',
    possibleExplanation: null,
    questionToValidate: null,
    consequenceIfUnaddressed: null,
    recommendation: 'Choisir deux secteurs pour le trimestre et geler les deux autres.',
    indicator: 'Nombre de secteurs réellement travaillés dans le trimestre',
    confidence: 'single_source',
    ...overrides,
  }
}

describe('auditMoveSchema — ce qu’il refuse', () => {
  const valid = {
    kind: 'pilotage',
    ruleId: 'tooManySimultaneousMarkets',
    subject: 'Choisir deux secteurs pour le trimestre et geler les deux autres.',
    reason: 'Quatre secteurs visés pour une seule personne à temps partiel.',
    expectedResult: 'Nombre de secteurs réellement travaillés dans le trimestre',
    targetKind: null,
    status: 'propose',
    confidence: 'single_source',
  }

  it('accepte un mouvement complet', () => {
    expect(auditMoveSchema.safeParse(valid).success).toBe(true)
  })

  it('refuse un mouvement sans objet — un geste vide n’est pas un geste', () => {
    expect(auditMoveSchema.safeParse({ ...valid, subject: '' }).success).toBe(false)
  })

  it('refuse un mouvement sans raison — un geste sans raison est un ordre', () => {
    expect(auditMoveSchema.safeParse({ ...valid, reason: '' }).success).toBe(false)
  })

  it('refuse un genre qui n’est pas l’un des trois nommés', () => {
    expect(auditMoveSchema.safeParse({ ...valid, kind: 'ouverture_commerciale' }).success).toBe(false)
  })

  it('refuse une règle de tension inconnue — la trace ne s’invente pas', () => {
    expect(auditMoveSchema.safeParse({ ...valid, ruleId: 'unePhraseLibre' }).success).toBe(false)
  })

  it('refuse un statut hors des quatre nommés', () => {
    expect(auditMoveSchema.safeParse({ ...valid, status: 'en_cours' }).success).toBe(false)
  })

  it('refuse un objet visé hors des huit natures canoniques d’une action', () => {
    expect(auditMoveSchema.safeParse({ ...valid, targetKind: 'compte' }).success).toBe(false)
  })

  it('accepte un résultat attendu NON MESURÉ (null), jamais une chaîne vide', () => {
    expect(auditMoveSchema.safeParse({ ...valid, expectedResult: null }).success).toBe(true)
    expect(auditMoveSchema.safeParse({ ...valid, expectedResult: '' }).success).toBe(false)
  })

  it('accepte une confiance NON MESURÉE (null) — « non mesurée » n’est pas « faible »', () => {
    expect(auditMoveSchema.safeParse({ ...valid, confidence: null }).success).toBe(true)
  })
})

describe('les trois genres et les quatre statuts sont NOMMÉS', () => {
  it('nomme exactement les trois mouvements du brief (#2074.11/.12/.13)', () => {
    expect([...AUDIT_MOVE_KINDS]).toEqual(['ouverture', 'engagement', 'pilotage'])
  })

  it('borne à TROIS mouvements (#2074.10)', () => {
    expect(MAX_AUDIT_MOVES).toBe(AUDIT_MOVE_KINDS.length)
    expect(MAX_AUDIT_MOVES).toBe(3)
  })

  it('nomme les quatre statuts, dont celui qui ARCHIVE sans supprimer', () => {
    expect([...AUDIT_MOVE_STATUSES]).toEqual(['propose', 'valide', 'modifie', 'ecarte'])
  })
})

describe('le classement des règles de tension — aucune ne tombe dans le vide', () => {
  it('classe CHAQUE règle de tension dans un genre (aucune ne se perd)', () => {
    for (const ruleId of commercialTensionRuleIdValues) {
      expect(AUDIT_MOVE_KIND_BY_RULE[ruleId], `règle non classée : ${ruleId}`).toBeDefined()
      expect(AUDIT_MOVE_KINDS).toContain(AUDIT_MOVE_KIND_BY_RULE[ruleId])
    }
  })

  it('n’ajoute aucune clé qui ne soit pas une règle de tension', () => {
    expect(Object.keys(AUDIT_MOVE_KIND_BY_RULE).sort()).toEqual([...commercialTensionRuleIdValues].sort())
    expect(Object.keys(AUDIT_MOVE_TARGET_BY_RULE).sort()).toEqual([...commercialTensionRuleIdValues].sort())
  })

  it('ne vise que des natures d’objet RÉELLES, ou rien du tout', () => {
    for (const ruleId of commercialTensionRuleIdValues) {
      const target = AUDIT_MOVE_TARGET_BY_RULE[ruleId]
      if (target !== null) expect(ACTION_TARGET_KINDS, `nature inventée pour ${ruleId}`).toContain(target)
    }
  })

  it('les trois genres sont tous représentés — aucun n’est décoratif', () => {
    const used = new Set(Object.values(AUDIT_MOVE_KIND_BY_RULE))
    for (const kind of AUDIT_MOVE_KINDS) expect(used).toContain(kind)
  })
})

describe('auditMovePage — la page BellumAI se DÉRIVE, elle ne se devine pas', () => {
  it('rend la page propriétaire de la nature visée, celle d’`actionOwnerPage` (GA-26)', () => {
    expect(auditMovePage({ targetKind: 'contact' })).toBe(actionOwnerPage('contact'))
    expect(auditMovePage({ targetKind: 'meeting' })).toBe(actionOwnerPage('meeting'))
  })

  it('ne rend AUCUNE page quand la règle ne vise aucun objet — jamais une page de repli', () => {
    expect(auditMovePage({ targetKind: null })).toBeNull()
  })
})

describe('auditMovesFrom — ce qui alimente réellement les mouvements', () => {
  it('ne produit RIEN sans rupture : un mouvement ne s’invente pas pour occuper la carte', () => {
    expect(auditMovesFrom([])).toEqual([])
    expect(auditMovesFrom(null)).toEqual([])
    expect(auditMovesFrom(undefined)).toEqual([])
  })

  it('reprend l’objet, la raison, le résultat attendu et la confiance de la rupture', () => {
    const [move] = auditMovesFrom([contradiction()])
    expect(move).toEqual({
      kind: 'pilotage',
      ruleId: 'tooManySimultaneousMarkets',
      subject: 'Choisir deux secteurs pour le trimestre et geler les deux autres.',
      reason: 'Quatre secteurs visés pour une seule personne à temps partiel.',
      expectedResult: 'Nombre de secteurs réellement travaillés dans le trimestre',
      targetKind: null,
      status: 'propose',
      confidence: 'single_source',
    })
  })

  it('rend TROIS mouvements au plus, un par genre, dans l’ordre ouverture → engagement → pilotage', () => {
    const moves = auditMovesFrom([
      contradiction({ ruleId: 'objectivesAboveCapacity' }),
      contradiction({ ruleId: 'contactWithoutFollowUpDate' }),
      contradiction({ ruleId: 'keyAccountsWithoutAccessPath' }),
      contradiction({ ruleId: 'missionsWithoutCapitalisation' }),
      contradiction({ ruleId: 'interviewWithoutFollowUp' }),
    ])
    expect(moves).toHaveLength(MAX_AUDIT_MOVES)
    expect(moves.map(move => move.kind)).toEqual(['ouverture', 'engagement', 'pilotage'])
  })

  it('garde la PREMIÈRE rupture de chaque genre — l’ordre des détecteurs fait foi', () => {
    const moves = auditMovesFrom([
      contradiction({ ruleId: 'contactWithoutFollowUpDate' }),
      contradiction({ ruleId: 'interviewWithoutFollowUp' }),
    ])
    expect(moves.map(move => move.ruleId)).toEqual(['contactWithoutFollowUpDate'])
  })

  it('ne rend qu’un genre quand une seule famille de rupture est détectée', () => {
    const moves = auditMovesFrom([
      contradiction({ ruleId: 'objectivesAboveCapacity' }),
      contradiction({ ruleId: 'tooManySimultaneousMarkets' }),
    ])
    expect(moves.map(move => move.kind)).toEqual(['pilotage'])
  })

  it('porte la nature visée quand la règle en nomme une, et la page qui en découle', () => {
    const [move] = auditMovesFrom([contradiction({ ruleId: 'contactWithoutFollowUpDate' })])
    expect(move?.targetKind).toBe('contact')
    expect(auditMovePage(move!)).toBe(actionOwnerPage('contact'))
  })

  it('chaque mouvement produit PARSE — la dérivation ne peut pas sortir du contrat', () => {
    for (const ruleId of commercialTensionRuleIdValues) {
      const [move] = auditMovesFrom([contradiction({ ruleId })])
      expect(auditMoveSchema.safeParse(move).success, `mouvement invalide pour ${ruleId}`).toBe(true)
    }
  })

  it('ne porte NI responsable NI échéance : l’audit n’en a aucune source (GA-26)', () => {
    const [move] = auditMovesFrom([contradiction()])
    expect(move).not.toHaveProperty('owner')
    expect(move).not.toHaveProperty('dueDate')
  })

  it('ne produit jamais autre chose que « proposé » — rien n’écrit tout seul', () => {
    for (const ruleId of commercialTensionRuleIdValues) {
      const [move] = auditMovesFrom([contradiction({ ruleId })])
      expect(move?.status).toBe('propose')
    }
  })
})
