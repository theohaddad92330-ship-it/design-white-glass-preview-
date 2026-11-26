import { describe, expect, it } from 'vitest'
import { DELEGATION_HOLD_REASONS, delegationVerdict, type DelegationFacts } from './outreach-delegation.js'

/**
 * #4016 L5 (reprise 20/10) — un usage qui dépose son message À L'AVANCE (une
 * étape de séquence à J+3, posée à la création de la séquence) date le fait
 * déclencheur à son ÉCHÉANCE. Le mandat ne fait jamais partir un message avant
 * cette échéance : sans cette porte, signer `workspace_sequences` aurait envoyé
 * toutes les relances d'une séquence au premier passage du dispatcher.
 */

const ID = '0125b778-807b-4025-a363-b31bfc819af1'
const CONTACT = '5a1b0c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d'
// Mercredi 7 octobre 2026, 10 h — dans les heures calmes.
const NOW = new Date(2026, 9, 7, 10, 0, 0)
const SIGNED = new Date(2026, 9, 6, 8).toISOString()

function facts(originatedAt: string | null): DelegationFacts {
  return {
    now: NOW,
    delegation: {
      id: ID,
      workspace_id: ID,
      scope: 'workspace_sequences',
      campaign_label: 'Séquences de l’espace',
      contact_ids: [],
      channels: ['email'],
      sender_mailbox_id: 'box-1',
      content_hash: null,
      window: { start_hour: 9, end_hour: 18 },
      starts_at: SIGNED,
      expires_at: new Date(2026, 9, 20, 8).toISOString(),
      max_messages: 50,
      sent_count: 0,
      validated_by: ['user-theo'],
      validated_at: SIGNED,
      revoked_at: null,
      paused_at: null,
    },
    step: {
      kind: 'email',
      channel: 'email',
      contact_id: CONTACT,
      content_hash: 'v1',
      sender_mailbox_id: 'box-1',
      scope: 'workspace_sequences',
      originated_at: originatedAt,
    },
    contact: { replied: false, opposed: false, excluded: false, erased: false, consent_expired: false },
    capabilities: { mailbox_connected: true, reply_reading_available: true },
  }
}

describe('#4016 L5 — une échéance future attend, même sous mandat', () => {
  it('`not_due` est nommé, en FIN de liste (GA-08)', () => {
    expect(DELEGATION_HOLD_REASONS.at(-1)).toBe('not_due')
  })

  it('une étape dont l’échéance n’est pas arrivée attend `not_due`', () => {
    const due = new Date(2026, 9, 10, 9).toISOString()
    expect(delegationVerdict(facts(due))).toEqual({ decision: 'awaits_validation', reason: 'not_due' })
  })

  it('à l’échéance, la même étape part sous mandat', () => {
    const due = new Date(2026, 9, 7, 9).toISOString()
    expect(delegationVerdict(facts(due))).toEqual({ decision: 'run', basis: 'delegation' })
  })

  it('une réponse arrête la suite avant même l’échéance', () => {
    const due = new Date(2026, 9, 10, 9).toISOString()
    const replied = { ...facts(due), contact: { ...facts(due).contact, replied: true } }
    expect(delegationVerdict(replied)).toEqual({ decision: 'stop', reason: 'replied' })
  })
})
