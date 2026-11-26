import { describe, expect, it } from 'vitest'
import {
  NOT_NOW_REVALIDATION_DAYS,
  OUTREACH_REPLY_CLASSES,
  OUTREACH_SEQUENCE_PAUSE_EVENTS,
  OUTREACH_SEQUENCE_STOP_EVENTS,
  notNowRevalidationDue,
  outreachReplyClassSchema,
  outreachReplyEffect,
  outreachSequencePauseEventSchema,
  outreachSequenceStopEventSchema,
} from './outreach-sequence-events.js'

// #2381.1/.2/.4/.5/.6 — LAU-FINAL-095, vocabulaire fermé + conséquence
// déterministe d'une classe de réponse.
describe('outreach — événements de séquence et classes de réponse (#2381)', () => {
  it('nomme les dix-sept événements d’arrêt, verbatim de l’issue (#2381.1)', () => {
    expect(OUTREACH_SEQUENCE_STOP_EVENTS).toEqual([
      'reply_received',
      'reply_positive',
      'refusal',
      'opt_out',
      'meeting_booked',
      'call_qualified',
      'wrong_person',
      'company_changed',
      'invalid_address',
      'hard_bounce',
      'need_closed',
      'opportunity_lost',
      'contact_removed',
      'manual_stop',
      'account_excluded',
      'sequence_replaced',
      'max_delay_reached',
    ])
    expect(outreachSequenceStopEventSchema.options).toHaveLength(17)
  })

  it('nomme les huit événements de pause de l’issue #2381, PLUS #2374.19 ajouté après (GA-08, jamais au milieu)', () => {
    expect(OUTREACH_SEQUENCE_PAUSE_EVENTS).toEqual([
      'connector_expired',
      'permission_revoked',
      'ambiguous_reply',
      'contact_to_verify',
      'temporary_absence',
      'dispute',
      'team_collision',
      'manual_action_pending',
      'not_now_deferred',
    ])
    expect(outreachSequencePauseEventSchema.options).toHaveLength(9)
  })

  it('nomme les onze classes de réponse, verbatim de l’issue (#2381.4)', () => {
    expect(OUTREACH_REPLY_CLASSES).toEqual([
      'positive',
      'neutral',
      'question',
      'orientation',
      'not_now',
      'refusal',
      'opt_out',
      'wrong_person',
      'out_of_office',
      'bounce',
      'unknown',
    ])
    expect(outreachReplyClassSchema.options).toHaveLength(11)
  })

  it('une absence du bureau se met en PAUSE, jamais en arrêt (#2381.5)', () => {
    expect(outreachReplyEffect('out_of_office')).toEqual({ action: 'pause', event: 'temporary_absence' })
  })

  it('une réponse positive arrête l’automatique ET crée une qualification (#2381.6)', () => {
    expect(outreachReplyEffect('positive')).toEqual({
      action: 'stop',
      event: 'reply_positive',
      createsQualification: true,
    })
  })

  it('un refus, un opt-out, une mauvaise personne et un bounce arrêtent SANS qualification', () => {
    expect(outreachReplyEffect('refusal')).toEqual({ action: 'stop', event: 'refusal', createsQualification: false })
    expect(outreachReplyEffect('opt_out')).toEqual({ action: 'stop', event: 'opt_out', createsQualification: false })
    expect(outreachReplyEffect('wrong_person')).toEqual({
      action: 'stop',
      event: 'wrong_person',
      createsQualification: false,
    })
    expect(outreachReplyEffect('bounce')).toEqual({
      action: 'stop',
      event: 'hard_bounce',
      createsQualification: false,
    })
  })

  it('toute réponse LISIBLE mais sans signal dédié arrête sur l’événement générique « réponse entrante »', () => {
    for (const cls of ['neutral', 'question', 'orientation'] as const) {
      expect(outreachReplyEffect(cls)).toEqual({
        action: 'stop',
        event: 'reply_received',
        createsQualification: false,
      })
    }
  })

  it('une réponse ILLISIBLE (« unknown ») met en PAUSE — réponse ambiguë, jamais un arrêt sans lecture', () => {
    expect(outreachReplyEffect('unknown')).toEqual({ action: 'pause', event: 'ambiguous_reply' })
  })

  it('#2374.19 (tranché sans Louis) — « pas maintenant » met en PAUSE, jamais un arrêt définitif', () => {
    // Avant #2374.19, `not_now` tombait dans le même sac que `neutral`/
    // `question`/`orientation` (arrêt générique, aucun chemin de retour).
    // Distinct désormais : la séquence reste reprenable via
    // `OutreachService.resume()` (geste humain, revérifie déjà le poste).
    expect(outreachReplyEffect('not_now')).toEqual({ action: 'pause', event: 'not_now_deferred' })
  })

  it('couvre les onze classes sans en oublier une (exhaustivité de la table)', () => {
    for (const cls of OUTREACH_REPLY_CLASSES) {
      expect(() => outreachReplyEffect(cls)).not.toThrow()
    }
  })
})

/**
 * #3061 — le point d'ancrage manquant nommé par #2800/#3061 : rien ne dit
 * QUAND une pause « pas maintenant » mérite d'être reconsidérée. Un
 * planificateur qui évaluerait lui-même poste/contexte/signal/pertinence à
 * échéance reste un chantier séparé (plusieurs jours, non tenté) — mais SAVOIR
 * si l'échéance est passée est un calcul pur, déterministe, et un
 * préalable à ce chantier comme à tout autre.
 */
describe('notNowRevalidationDue (#3061)', () => {
  const NOW = new Date('2026-09-26T12:00:00.000Z')

  it('n’est jamais due avant le délai', () => {
    const pausedAt = new Date(NOW.getTime() - (NOT_NOW_REVALIDATION_DAYS - 1) * 24 * 60 * 60 * 1000)
    expect(notNowRevalidationDue(pausedAt, NOW)).toBe(false)
  })

  it('devient due une fois le délai dépassé', () => {
    const pausedAt = new Date(NOW.getTime() - (NOT_NOW_REVALIDATION_DAYS + 1) * 24 * 60 * 60 * 1000)
    expect(notNowRevalidationDue(pausedAt, NOW)).toBe(true)
  })

  it('accepte une date ISO comme une date structurée — même lecture', () => {
    const iso = new Date(NOW.getTime() - (NOT_NOW_REVALIDATION_DAYS + 5) * 24 * 60 * 60 * 1000).toISOString()
    expect(notNowRevalidationDue(iso, NOW)).toBe(true)
  })

  it('une date illisible n’est jamais due — on ne devine pas une échéance', () => {
    expect(notNowRevalidationDue('pas-une-date', NOW)).toBe(false)
  })
})
