import { describe, expect, it } from 'vitest'
import {
  DELEGABLE_CHANNELS,
  DELEGATION_MAX_DAYS,
  DELEGATION_MAX_MESSAGES,
  delegationVerdict,
  outreachDelegationDraftSchema,
  type DelegationFacts,
  type OutreachDelegation,
} from './outreach-delegation.js'

/**
 * #3702 — la délégation d'envoi : explicite, bornée, révocable, arrêtée par la
 * réponse. Sans délégation, c81 s'applique INCHANGÉE (« ce qui sort attend »).
 */

const ID = '0125b778-807b-4025-a363-b31bfc819af1'
const CONTACT = '5a1b0c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d'
// Mercredi 7 octobre 2026, 10 h — dans les heures calmes.
const NOW = new Date(2026, 9, 7, 10, 0, 0)

function delegation(over: Partial<OutreachDelegation> = {}): OutreachDelegation {
  return {
    id: ID,
    workspace_id: ID,
    scope: 'campaign',
    campaign_label: 'Octobre ESN',
    contact_ids: [CONTACT],
    channels: ['email'],
    sender_mailbox_id: 'box-1',
    content_hash: 'h1',
    window: { start_hour: 9, end_hour: 18 },
    starts_at: new Date(2026, 9, 6, 8).toISOString(),
    expires_at: new Date(2026, 9, 20, 8).toISOString(),
    max_messages: 5,
    sent_count: 0,
    validated_by: ['user-theo'],
    validated_at: new Date(2026, 9, 6, 8).toISOString(),
    revoked_at: null,
    paused_at: null,
    ...over,
  }
}

function facts(over: Partial<DelegationFacts> = {}): DelegationFacts {
  return {
    now: NOW,
    delegation: delegation(),
    step: { kind: 'email', channel: 'email', contact_id: CONTACT, content_hash: 'h1', sender_mailbox_id: 'box-1' },
    contact: { replied: false, opposed: false, excluded: false },
    capabilities: { mailbox_connected: true, reply_reading_available: true },
    ...over,
  }
}

describe('delegationVerdict — sans délégation, c81 inchangée', () => {
  it('un e-mail sans délégation ATTEND une validation', () => {
    expect(delegationVerdict(facts({ delegation: null }))).toEqual({
      decision: 'awaits_validation',
      reason: 'no_delegation',
    })
  })

  it('une nature inconnue tombe du côté qui attend, délégation active ou non', () => {
    const verdict = delegationVerdict(facts({ step: { ...facts().step, kind: 'sms', channel: 'sms' } }))
    expect(verdict.decision).toBe('awaits_validation')
  })

  it('une étape INTERNE part à l’heure dite, déléguée ou non', () => {
    const step = { ...facts().step, kind: 'reminder' }
    expect(delegationVerdict(facts({ delegation: null, step }))).toEqual({ decision: 'run', basis: 'internal' })
  })
})

describe('delegationVerdict — en mode délégué, seul ce qui est autorisé part', () => {
  it('étape, contact, canal, expéditeur et contenu dans le mandat ⇒ part', () => {
    expect(delegationVerdict(facts())).toEqual({ decision: 'run', basis: 'delegation' })
  })

  it('un contact hors du mandat attend', () => {
    const step = { ...facts().step, contact_id: '9a1b0c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d' }
    expect(delegationVerdict(facts({ step }))).toEqual({
      decision: 'awaits_validation',
      reason: 'contact_out_of_scope',
    })
  })

  it('un contenu modifié après accord demande une NOUVELLE validation', () => {
    const step = { ...facts().step, content_hash: 'h2' }
    expect(delegationVerdict(facts({ step }))).toEqual({ decision: 'awaits_validation', reason: 'content_changed' })
  })

  it('un autre expéditeur que celui du mandat attend', () => {
    const step = { ...facts().step, sender_mailbox_id: 'box-2' }
    expect(delegationVerdict(facts({ step }))).toEqual({ decision: 'awaits_validation', reason: 'sender_mismatch' })
  })

  it('LinkedIn et l’appel ne sont jamais délégables — aucune promesse d’automatisme', () => {
    expect(DELEGABLE_CHANNELS).toEqual(['email'])
    for (const channel of ['linkedin', 'phone']) {
      const step = { ...facts().step, channel }
      expect(delegationVerdict(facts({ step }))).toEqual({
        decision: 'awaits_validation',
        reason: 'channel_not_delegable',
      })
    }
  })

  it('une tâche « demande LinkedIn » reste INTERNE : Bellum crée la tâche, le commercial envoie', () => {
    const step = { ...facts().step, kind: 'task', channel: 'linkedin' }
    expect(delegationVerdict(facts({ step }))).toEqual({ decision: 'run', basis: 'internal' })
  })
})

describe('delegationVerdict — borne, pause, révocation', () => {
  it('révoquée, en pause, pas commencée, expirée : rien ne part, la raison est nommée', () => {
    const cases: [Partial<OutreachDelegation>, string][] = [
      [{ revoked_at: NOW.toISOString() }, 'revoked'],
      [{ paused_at: NOW.toISOString() }, 'paused'],
      [{ starts_at: new Date(2026, 9, 8).toISOString() }, 'not_started'],
      [{ expires_at: new Date(2026, 9, 7, 9).toISOString() }, 'expired'],
    ]
    for (const [over, reason] of cases) {
      expect(delegationVerdict(facts({ delegation: delegation(over) }))).toEqual({
        decision: 'awaits_validation',
        reason,
      })
    }
  })

  it('le volume est évalué au moment utile : plafond atteint ⇒ attend', () => {
    expect(delegationVerdict(facts({ delegation: delegation({ sent_count: 5, max_messages: 5 }) }))).toEqual({
      decision: 'awaits_validation',
      reason: 'quota_reached',
    })
  })

  it('hors fenêtre d’envoi ou hors heures calmes ⇒ reporté, jamais perdu', () => {
    const night = new Date(2026, 9, 7, 7, 0, 0)
    const sunday = new Date(2026, 9, 11, 10, 0, 0)
    expect(delegationVerdict(facts({ now: night }))).toEqual({
      decision: 'awaits_validation',
      reason: 'outside_window',
    })
    expect(delegationVerdict(facts({ now: sunday }))).toEqual({
      decision: 'awaits_validation',
      reason: 'outside_window',
    })
  })
})

describe('delegationVerdict — arrêt sur réponse', () => {
  it('une réponse ARRÊTE la suite, même avec un mandat valide', () => {
    expect(delegationVerdict(facts({ contact: { replied: true, opposed: false, excluded: false } }))).toEqual({
      decision: 'stop',
      reason: 'replied',
    })
  })

  it('une opposition ou une exclusion aussi', () => {
    expect(delegationVerdict(facts({ contact: { replied: false, opposed: true, excluded: false } }))).toEqual({
      decision: 'stop',
      reason: 'opposed',
    })
    expect(delegationVerdict(facts({ contact: { replied: false, opposed: false, excluded: true } }))).toEqual({
      decision: 'stop',
      reason: 'excluded',
    })
  })

  it('la réponse l’emporte sur une pause ou une heure creuse', () => {
    const verdict = delegationVerdict(
      facts({
        now: new Date(2026, 9, 7, 3),
        delegation: delegation({ paused_at: NOW.toISOString() }),
        contact: { replied: true, opposed: false, excluded: false },
      }),
    )
    expect(verdict).toEqual({ decision: 'stop', reason: 'replied' })
  })

  it('lecture des réponses indisponible ⇒ SUSPEND (on ne peut pas garantir l’arrêt)', () => {
    expect(
      delegationVerdict(facts({ capabilities: { mailbox_connected: true, reply_reading_available: false } })),
    ).toEqual({
      decision: 'awaits_validation',
      reason: 'replies_unreadable',
    })
  })

  it('boîte déconnectée ou permission retirée ⇒ jamais masqué par « Active »', () => {
    expect(
      delegationVerdict(facts({ capabilities: { mailbox_connected: false, reply_reading_available: true } })),
    ).toEqual({
      decision: 'awaits_validation',
      reason: 'mailbox_unavailable',
    })
  })
})

describe('outreachDelegationDraftSchema — une délégation est BORNÉE à la création', () => {
  const draft = {
    campaign_label: 'Octobre ESN',
    contact_ids: [CONTACT],
    channels: ['email'],
    sender_mailbox_id: 'box-1',
    window: { start_hour: 9, end_hour: 18 },
    duration_days: 7,
    max_messages: 20,
  }

  it('accepte une délégation bornée', () => {
    expect(outreachDelegationDraftSchema.safeParse(draft).success).toBe(true)
  })

  it('refuse ce qui n’a pas de borne : durée, volume, contacts, canal', () => {
    expect(outreachDelegationDraftSchema.safeParse({ ...draft, duration_days: DELEGATION_MAX_DAYS + 1 }).success).toBe(
      false,
    )
    expect(
      outreachDelegationDraftSchema.safeParse({ ...draft, max_messages: DELEGATION_MAX_MESSAGES + 1 }).success,
    ).toBe(false)
    expect(outreachDelegationDraftSchema.safeParse({ ...draft, contact_ids: [] }).success).toBe(false)
    expect(outreachDelegationDraftSchema.safeParse({ ...draft, channels: ['linkedin'] }).success).toBe(false)
    expect(outreachDelegationDraftSchema.safeParse({ ...draft, window: { start_hour: 18, end_hour: 9 } }).success).toBe(
      false,
    )
  })
})
