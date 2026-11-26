import {
  assembleReplyFeedbackMemory,
  REPLY_FEEDBACK_REPEAT_THRESHOLD,
  type ReplyMemoryRow,
} from './reply-feedback-memory'

const NOW = new Date('2026-09-13T09:00:00.000Z')
let sequence = 0

function row(partial: Partial<ReplyMemoryRow> = {}): ReplyMemoryRow {
  sequence += 1
  return {
    reply_digest: `digest-${sequence}`.padEnd(16, '0'),
    verdict: 'pas_pertinent',
    reason: 'mauvais_timing',
    note: null,
    correction_field: null,
    correction_value: null,
    correction_scope: null,
    account_name: 'Groupe Vallée',
    created_at: new Date(NOW.getTime() - sequence * 60_000),
    ...partial,
  }
}

describe('assembleReplyFeedbackMemory — la mémoire des retours d’UNE personne (déterministe, sans modèle)', () => {
  it('rend une chaîne vide sans retour — le prompt reste byte-identique', () => {
    expect(assembleReplyFeedbackMemory([], NOW)).toBe('')
  })

  it('#1919.16 — un refus UNIQUE porte sur son objet et ne se généralise pas', () => {
    const out = assembleReplyFeedbackMemory(
      [row({ account_name: 'Groupe Vallée', reason: 'hors_positionnement' })],
      NOW,
    )
    expect(out).toContain('« Groupe Vallée »')
    expect(out).toContain('PAS PERTINENTE')
    expect(out).toContain('hors positionnement')
    expect(out).toContain('ce refus porte sur elle seule')
    expect(out).not.toContain('RÉPÉTÉ')
  })

  // #2444.1 (suite) — les cinq motifs élargis du 23/09 ont chacun leur libellé
  // FR dans la mémoire du prompt : sans `REASON_LABELS[reason]`, la ligne
  // retomberait sur le token brut (`source_douteuse` au lieu de « source
  // douteuse »), lisible par personne.
  it('#2444.1 — les cinq motifs élargis portent un libellé FR lisible, pas leur token brut', () => {
    const cases: Array<[ReplyMemoryRow['reason'], string]> = [
      ['doublon', 'doublon'],
      ['source_douteuse', 'source douteuse'],
      ['contact_parti', 'contact parti'],
      ['concurrent_en_place', 'concurrent déjà en place'],
      ['budget_insuffisant', 'budget insuffisant'],
    ]
    for (const [reason, label] of cases) {
      const out = assembleReplyFeedbackMemory([row({ reason, account_name: 'Groupe Vallée' })], NOW)
      expect(out).toContain(`motif : ${label}`)
      // Le token brut porte un `_` dès qu'il diffère de son libellé — jamais dans la ligne rendue.
      if ((reason as string).includes('_')) expect(out).not.toContain(reason as string)
    }
  })

  it('#1919.16 — deux refus du même motif ne suffisent pas', () => {
    const out = assembleReplyFeedbackMemory(
      [row({ reason: 'hors_positionnement' }), row({ reason: 'hors_positionnement', account_name: 'Acme' })],
      NOW,
    )
    expect(REPLY_FEEDBACK_REPEAT_THRESHOLD).toBe(3)
    expect(out).not.toContain('RÉPÉTÉ')
  })

  it('#1919.16 — trois réponses DISTINCTES refusées pour le même motif : la tendance se dit, une fois, comptée', () => {
    const out = assembleReplyFeedbackMemory(
      [
        row({ reason: 'hors_positionnement', account_name: 'Groupe Vallée' }),
        row({ reason: 'hors_positionnement', account_name: 'Acme' }),
        row({ reason: 'hors_positionnement', account_name: null }),
      ],
      NOW,
    )
    const repeated = out.split('\n').filter(line => line.includes('RÉPÉTÉ'))
    expect(repeated).toHaveLength(1)
    expect(repeated[0]).toContain('3 fois')
    expect(repeated[0]).toContain('hors positionnement')
    expect(repeated[0]).toContain('tu le dis')
    // Les RÉPÉTÉ passent en tête : c'est la seule ligne qui vaut au-delà d'un objet.
    expect(out.split('\n')[0]).toContain('RÉPÉTÉ')
  })

  it('sait dire NON — trois clics sur la MÊME réponse restent UN avis, pas une tendance', () => {
    const digest = 'aaaaaaaaaaaaaaaa'
    const out = assembleReplyFeedbackMemory(
      [
        row({ reply_digest: digest, reason: 'hors_positionnement' }),
        row({ reply_digest: digest, reason: 'hors_positionnement' }),
        row({ reply_digest: digest, reason: 'hors_positionnement' }),
      ],
      NOW,
    )
    expect(out).not.toContain('RÉPÉTÉ')
    expect(out.split('\n')).toHaveLength(1)
  })

  it('« Autre » ne se généralise jamais, même répété — son texte libre n’est pas une catégorie', () => {
    const out = assembleReplyFeedbackMemory(
      [row({ reason: 'autre' }), row({ reason: 'autre' }), row({ reason: 'autre' }), row({ reason: 'autre' })],
      NOW,
    )
    expect(out).not.toContain('RÉPÉTÉ')
  })

  it('le DERNIER avis sur une réponse gagne — un « pas pertinent » corrigé en « utile » ne pèse plus', () => {
    const digest = 'bbbbbbbbbbbbbbbb'
    const out = assembleReplyFeedbackMemory(
      [
        row({ reply_digest: digest, verdict: 'pas_pertinent', created_at: new Date('2026-09-10T08:00:00Z') }),
        row({ reply_digest: digest, verdict: 'utile', reason: null, created_at: new Date('2026-09-12T08:00:00Z') }),
      ],
      NOW,
    )
    expect(out).toContain('UTILE')
    expect(out).not.toContain('PAS PERTINENTE')
  })

  it('#1928.7 — « trop long » sur trois réponses distinctes devient une tendance de FORME', () => {
    const out = assembleReplyFeedbackMemory(
      [row({ reason: 'trop_long' }), row({ reason: 'trop_long' }), row({ reason: 'trop_long' })],
      NOW,
    )
    expect(out).toContain('RÉPÉTÉ 3 fois')
    expect(out).toContain('trop longues')
  })

  it('#1919.6 — « mauvaise priorité » répétée se dit aussi', () => {
    const out = assembleReplyFeedbackMemory(
      [
        row({ verdict: 'mauvaise_priorite', reason: null }),
        row({ verdict: 'mauvaise_priorite', reason: null }),
        row({ verdict: 'mauvaise_priorite', reason: null }),
      ],
      NOW,
    )
    expect(out).toContain('RÉPÉTÉ 3 fois')
    expect(out).toContain('priorités contestées')
  })

  it('#1919.7 — « Donnée fausse » cite la correction et dit qu’elle prime', () => {
    const out = assembleReplyFeedbackMemory(
      [
        row({
          verdict: 'donnee_fausse',
          reason: null,
          correction_field: 'Le DSI',
          correction_value: 'Claire Martin depuis juin',
          correction_scope: 'account',
        }),
      ],
      NOW,
    )
    expect(out).toContain('FAUSSE')
    expect(out).toContain('« Le DSI »')
    expect(out).toContain('« Claire Martin depuis juin »')
    expect(out).toContain('dossier du compte')
    expect(out).toContain('la correction de la personne prime')
  })

  it('#1919.4 / #1919.5 — « Déjà fait » et « Pas maintenant » ont chacun leur consigne', () => {
    const out = assembleReplyFeedbackMemory(
      [row({ verdict: 'deja_fait', reason: null }), row({ verdict: 'pas_maintenant', reason: null })],
      NOW,
    )
    expect(out).toContain('DÉJÀ FAITE')
    expect(out).toContain('pas maintenant')
  })

  it('#1919.5 — un « pas maintenant » de plus de 30 jours ne retient plus rien', () => {
    const out = assembleReplyFeedbackMemory(
      [row({ verdict: 'pas_maintenant', reason: null, created_at: new Date('2026-08-01T08:00:00Z') })],
      NOW,
    )
    expect(out).toBe('')
  })

  it('une réponse sans compte se nomme comme telle, jamais par un compte deviné', () => {
    const out = assembleReplyFeedbackMemory([row({ account_name: null })], NOW)
    expect(out).toContain('sans compte précis')
  })

  it('#1919.14 — ni l’empreinte ni le texte de la réponse n’entrent dans le prompt', () => {
    const out = assembleReplyFeedbackMemory([row({ reply_digest: 'cccccccccccccccc' })], NOW)
    expect(out).not.toContain('cccccccccccccccc')
  })

  it('borne le volume : lignes et caractères plafonnés quel que soit l’historique', () => {
    const rows = Array.from({ length: 60 }, () =>
      row({ reason: 'autre', note: 'Une précision très longue '.repeat(40) }),
    )
    const out = assembleReplyFeedbackMemory(rows, NOW)
    expect(out.split('\n').length).toBeLessThanOrEqual(15)
    expect(out.length).toBeLessThanOrEqual(2400)
    // Le texte libre est cité, aplati et tronqué.
    expect(out).not.toContain('\n\n')
  })
})
