import { describe, expect, it } from 'vitest'
import {
  REPLY_FEEDBACK_CATEGORIES,
  REPLY_FEEDBACK_CORRECTION_SCOPES,
  REPLY_FEEDBACK_REASONS,
  REPLY_FEEDBACK_VERDICTS,
  createReplyFeedbackSchema,
  replyDigest,
} from './reply-feedback.js'

const DIGEST = replyDigest('Priorise EDF cette semaine : le DSI vient de changer.')
const ACCOUNT = '5b7d0c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'

describe('#1919 — les retours sur une réponse de Laura (contrat)', () => {
  it('#1919.1 → .6 — les six retours de l’issue, dans son ordre, et aucun autre', () => {
    expect(REPLY_FEEDBACK_VERDICTS).toEqual([
      'utile',
      'pas_pertinent',
      'donnee_fausse',
      'deja_fait',
      'pas_maintenant',
      'mauvaise_priorite',
    ])
  })

  it('#1919.8 → .13 — les six motifs de l’issue, « trop long » (#1928.7), puis les cinq motifs élargis du 23/09 (#2444.1)', () => {
    expect(REPLY_FEEDBACK_REASONS).toEqual([
      'mauvais_compte',
      'mauvais_contact',
      'mauvais_timing',
      'hors_positionnement',
      'deja_traite',
      'autre',
      'trop_long',
      'doublon',
      'source_douteuse',
      'contact_parti',
      'concurrent_en_place',
      'budget_insuffisant',
    ])
    expect(REPLY_FEEDBACK_CORRECTION_SCOPES).toEqual(['reply', 'account'])
  })

  // #2444.1 — RÉFUTÉ en prod (sha 4a4e9e07d) : « Pas pertinent » n'offrait que
  // 6 verdicts + 7 sous-motifs = 13 catégories, sous la demande « au moins 15 ».
  it('#2444.1 — « Pas pertinent » atteint au moins 15 catégories (verdicts + motifs)', () => {
    expect(REPLY_FEEDBACK_VERDICTS.length + REPLY_FEEDBACK_REASONS.length).toBeGreaterThanOrEqual(15)
    // Chaque motif reste un token unique — un doublon romprait le CHECK et l'écran.
    expect(new Set(REPLY_FEEDBACK_REASONS).size).toBe(REPLY_FEEDBACK_REASONS.length)
    for (const reason of ['doublon', 'source_douteuse', 'contact_parti', 'concurrent_en_place', 'budget_insuffisant']) {
      expect(
        createReplyFeedbackSchema.safeParse({ replyDigest: DIGEST, verdict: 'pas_pertinent', reason }).success,
      ).toBe(true)
    }
  })

  it('accepte un « Utile » nu', () => {
    expect(createReplyFeedbackSchema.safeParse({ replyDigest: DIGEST, verdict: 'utile' }).success).toBe(true)
  })

  // #2444.1 — au moins 15 catégories, un axe indépendant du verdict/motif.
  it('#2444.1 — au moins 15 catégories de feedback, indépendantes du verdict', () => {
    expect(REPLY_FEEDBACK_CATEGORIES.length).toBeGreaterThanOrEqual(15)
    expect(
      createReplyFeedbackSchema.safeParse({ replyDigest: DIGEST, verdict: 'utile', category: 'bug_interface' }).success,
    ).toBe(true)
    expect(
      createReplyFeedbackSchema.safeParse({ replyDigest: DIGEST, verdict: 'utile', category: 'inconnue' }).success,
    ).toBe(false)
  })

  it('un motif n’accompagne que « Pas pertinent »', () => {
    expect(
      createReplyFeedbackSchema.safeParse({ replyDigest: DIGEST, verdict: 'pas_pertinent', reason: 'mauvais_timing' })
        .success,
    ).toBe(true)
    expect(
      createReplyFeedbackSchema.safeParse({ replyDigest: DIGEST, verdict: 'utile', reason: 'mauvais_timing' }).success,
    ).toBe(false)
  })

  it('un texte libre n’accompagne que le motif « Autre » — on ne collecte pas de texte sans raison', () => {
    expect(
      createReplyFeedbackSchema.safeParse({
        replyDigest: DIGEST,
        verdict: 'pas_pertinent',
        reason: 'autre',
        note: 'On ne vend pas de régie à ce client.',
      }).success,
    ).toBe(true)
    expect(
      createReplyFeedbackSchema.safeParse({
        replyDigest: DIGEST,
        verdict: 'pas_pertinent',
        reason: 'mauvais_compte',
        note: 'texte',
      }).success,
    ).toBe(false)
  })

  it('#1919.7 — « Donnée fausse » EXIGE la correction (quoi) et son périmètre', () => {
    expect(createReplyFeedbackSchema.safeParse({ replyDigest: DIGEST, verdict: 'donnee_fausse' }).success).toBe(false)
    expect(
      createReplyFeedbackSchema.safeParse({
        replyDigest: DIGEST,
        verdict: 'donnee_fausse',
        correction: { field: 'Le DSI', value: 'Claire Martin depuis juin', scope: 'reply' },
      }).success,
    ).toBe(true)
  })

  it('#1919.7 — une correction ne voyage pas avec un autre retour', () => {
    expect(
      createReplyFeedbackSchema.safeParse({
        replyDigest: DIGEST,
        verdict: 'utile',
        correction: { field: 'x', scope: 'reply' },
      }).success,
    ).toBe(false)
  })

  it('#1919.7 — corriger le DOSSIER d’un compte suppose de nommer ce compte', () => {
    const correction = { field: 'Chiffre d’affaires', value: '12 M€', scope: 'account' as const }
    expect(
      createReplyFeedbackSchema.safeParse({ replyDigest: DIGEST, verdict: 'donnee_fausse', correction }).success,
    ).toBe(false)
    expect(
      createReplyFeedbackSchema.safeParse({
        replyDigest: DIGEST,
        verdict: 'donnee_fausse',
        correction,
        accountId: ACCOUNT,
      }).success,
    ).toBe(true)
  })

  it('#1919.14 — le lien vers la réponse est une EMPREINTE, jamais le texte recopié', () => {
    expect(createReplyFeedbackSchema.safeParse({ replyDigest: 'Voici ma réponse', verdict: 'utile' }).success).toBe(
      false,
    )
    const parsed = createReplyFeedbackSchema.parse({ replyDigest: DIGEST, verdict: 'utile' })
    expect(Object.keys(parsed)).not.toContain('text')
  })
})

describe('#1919.14 — replyDigest, l’empreinte d’une réponse', () => {
  it('est déterministe, en 16 caractères hexadécimaux', () => {
    expect(replyDigest('Bonjour')).toMatch(/^[0-9a-f]{16}$/)
    expect(replyDigest('Bonjour')).toBe(replyDigest('Bonjour'))
  })

  it('ignore les blancs de bord — le fil relu et la bulle vivante portent le même texte', () => {
    expect(replyDigest('  Bonjour\n')).toBe(replyDigest('Bonjour'))
  })

  it('distingue deux réponses différentes, y compris d’un seul caractère', () => {
    expect(replyDigest('Priorise EDF.')).not.toBe(replyDigest('Priorise EDF !'))
  })

  it('ne change JAMAIS d’algorithme en silence — les empreintes sont stockées en base', () => {
    // Un changement de calcul orphelinerait chaque retour déjà donné : sa réponse
    // ne serait plus retrouvée, ni à l'écran ni au rattachement du message.
    expect(replyDigest('Priorise EDF cette semaine : le DSI vient de changer.')).toBe('1a93ea25d9ba5927')
  })
})
