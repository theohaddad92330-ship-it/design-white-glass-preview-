import { describe, expect, it } from 'vitest'
import {
  DELEGATION_HOLD_REASONS,
  DELEGATION_MAX_DAYS,
  DELEGATION_SCOPES,
  DELEGATION_STOP_REASONS,
  SEND_BOUNDS_BY_PLAN,
  SEND_BOUNDS_FLOOR,
  WORKSPACE_DELEGATION_SCOPES,
  createScopedDelegationRequestSchema,
  delegationVerdict,
  exceedsPlanBounds,
  renewDelegationRequestSchema,
  sendBoundsOfPlan,
  type DelegationFacts,
  type OutreachDelegation,
} from './outreach-delegation.js'

/**
 * #4016 L5 — DÉCISION LOUIS 11/10/2026 : l'envoi automatique devient possible,
 * TOUJOURS derrière un mandat signé — une portée par usage. Sans mandat qui
 * couvre la portée : rien ne part (« inconnu ⇒ attend », c81 inchangée).
 */

const ID = '0125b778-807b-4025-a363-b31bfc819af1'
const CONTACT = '5a1b0c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d'
// Mercredi 7 octobre 2026, 10 h — dans les heures calmes.
const NOW = new Date(2026, 9, 7, 10, 0, 0)
const SIGNED = new Date(2026, 9, 6, 8).toISOString()
const AFTER_SIGNATURE = new Date(2026, 9, 6, 15).toISOString()

function mandate(over: Partial<OutreachDelegation> = {}): OutreachDelegation {
  return {
    id: ID,
    workspace_id: ID,
    scope: 'laura_send',
    campaign_label: 'Laura envoie ce qu’elle prépare',
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
    ...over,
  }
}

function facts(over: Partial<DelegationFacts> = {}): DelegationFacts {
  return {
    now: NOW,
    delegation: mandate(),
    step: {
      kind: 'email',
      channel: 'email',
      contact_id: CONTACT,
      content_hash: 'v1',
      sender_mailbox_id: 'box-1',
      scope: 'laura_send',
      originated_at: AFTER_SIGNATURE,
    },
    contact: { replied: false, opposed: false, excluded: false, erased: false, consent_expired: false },
    capabilities: { mailbox_connected: true, reply_reading_available: true },
    ...over,
  }
}

describe('#4016 L5 — cinq portées + LinkedIn (#4737), la campagne c89 en tête, gelées en fin (GA-08)', () => {
  it('les usages de la décision sont nommés, et rien de plus', () => {
    expect(DELEGATION_SCOPES).toEqual([
      'campaign',
      'workspace_sequences',
      'laura_send',
      'payment_reminder',
      'meeting_follow_up',
      'linkedin_send',
    ])
    expect(WORKSPACE_DELEGATION_SCOPES).not.toContain('campaign')
    // LinkedIn se signe par sa route, avec sa borne par jour : pas une portée d'espace e-mail.
    expect(WORKSPACE_DELEGATION_SCOPES).not.toContain('linkedin_send')
    expect(WORKSPACE_DELEGATION_SCOPES).toHaveLength(4)
  })

  it('les nouvelles raisons s’ajoutent en FIN — aucune raison existante ne bouge', () => {
    expect(DELEGATION_HOLD_REASONS.slice(-3, -1)).toEqual(['scope_mismatch', 'predates_mandate'])
    expect(DELEGATION_STOP_REASONS).toEqual(['replied', 'opposed', 'excluded', 'erased', 'consent_expired'])
  })
})

describe('#4016 L5 — chaque portée part SOUS SON mandat, et seulement sous lui', () => {
  it.each(['workspace_sequences', 'laura_send', 'payment_reminder', 'meeting_follow_up'] as const)(
    '%s : mandat signé et actif ⇒ part',
    scope => {
      const verdict = delegationVerdict(facts({ delegation: mandate({ scope }), step: { ...facts().step, scope } }))
      expect(verdict).toEqual({ decision: 'run', basis: 'delegation' })
    },
  )

  it.each(['workspace_sequences', 'laura_send', 'payment_reminder', 'meeting_follow_up'] as const)(
    '%s : SANS mandat ⇒ attend (c81 inchangée)',
    scope => {
      expect(delegationVerdict(facts({ delegation: null, step: { ...facts().step, scope } }))).toEqual({
        decision: 'awaits_validation',
        reason: 'no_delegation',
      })
    },
  )

  it('un mandat signé pour une AUTRE portée ne couvre rien — Laura ne part pas sous le mandat des relances', () => {
    const verdict = delegationVerdict(facts({ delegation: mandate({ scope: 'payment_reminder' }) }))
    expect(verdict).toEqual({ decision: 'awaits_validation', reason: 'scope_mismatch' })
  })

  it('un mandat de CAMPAGNE ne couvre pas un envoi de Laura', () => {
    const verdict = delegationVerdict(facts({ delegation: mandate({ scope: 'campaign', contact_ids: [CONTACT] }) }))
    expect(verdict).toEqual({ decision: 'awaits_validation', reason: 'scope_mismatch' })
  })

  it('une étape sans portée déclarée est une étape de CAMPAGNE — elle ne profite pas d’un mandat d’espace', () => {
    const { scope: _ignored, ...legacy } = facts().step
    expect(delegationVerdict(facts({ step: legacy }))).toEqual({
      decision: 'awaits_validation',
      reason: 'scope_mismatch',
    })
  })
})

describe('#4016 L5 — pas de mandat rétroactif', () => {
  it('un fait né AVANT la signature attend', () => {
    const step = { ...facts().step, originated_at: new Date(2026, 9, 5).toISOString() }
    expect(delegationVerdict(facts({ step }))).toEqual({ decision: 'awaits_validation', reason: 'predates_mandate' })
  })

  it('un fait de date INCONNUE attend aussi — inconnu ⇒ attend', () => {
    for (const originated_at of [null, undefined, 'pas une date']) {
      const step = { ...facts().step, originated_at }
      expect(delegationVerdict(facts({ step }))).toEqual({
        decision: 'awaits_validation',
        reason: 'predates_mandate',
      })
    }
  })
})

describe('#4016 L5 — les faits du contact sont relus À CHAQUE ENVOI', () => {
  it('effacement RGPD (c69) ⇒ arrêt définitif, même mandat actif', () => {
    const contact = { ...facts().contact, erased: true }
    expect(delegationVerdict(facts({ contact }))).toEqual({ decision: 'stop', reason: 'erased' })
  })

  it('consentement expiré (c45) ⇒ arrêt', () => {
    const contact = { ...facts().contact, consent_expired: true }
    expect(delegationVerdict(facts({ contact }))).toEqual({ decision: 'stop', reason: 'consent_expired' })
  })

  it('opposition, exclusion, réponse ⇒ arrêt, comme pour une campagne', () => {
    for (const [key, reason] of [
      ['opposed', 'opposed'],
      ['excluded', 'excluded'],
      ['replied', 'replied'],
    ] as const) {
      const contact = { ...facts().contact, [key]: true }
      expect(delegationVerdict(facts({ contact }))).toEqual({ decision: 'stop', reason })
    }
  })

  it('contacts nommés au mandat d’espace ⇒ les autres attendent', () => {
    const delegation = mandate({ contact_ids: ['9a1b0c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d'] })
    expect(delegationVerdict(facts({ delegation }))).toEqual({
      decision: 'awaits_validation',
      reason: 'contact_out_of_scope',
    })
  })

  it('révoqué, en pause, expiré, plafond atteint : rien ne part, raison nommée', () => {
    const cases: [Partial<OutreachDelegation>, string][] = [
      [{ revoked_at: NOW.toISOString() }, 'revoked'],
      [{ paused_at: NOW.toISOString() }, 'paused'],
      [{ expires_at: new Date(2026, 9, 7, 9).toISOString() }, 'expired'],
      [{ sent_count: 50 }, 'quota_reached'],
    ]
    for (const [over, reason] of cases) {
      expect(delegationVerdict(facts({ delegation: mandate(over) }))).toEqual({
        decision: 'awaits_validation',
        reason,
      })
    }
  })
})

describe('#4016 L5 — signer est un geste explicite', () => {
  const draft = {
    scope: 'laura_send',
    campaign_label: 'Laura envoie',
    channels: ['email'],
    sender_mailbox_id: 'box-1',
    window: { start_hour: 9, end_hour: 18 },
    duration_days: 14,
    max_messages: 40,
    signed: true,
  }

  it('accepte un mandat d’espace signé et borné', () => {
    expect(createScopedDelegationRequestSchema.safeParse(draft).success).toBe(true)
  })

  it('refuse un mandat NON signé, ou signé par autre chose que `true`', () => {
    expect(createScopedDelegationRequestSchema.safeParse({ ...draft, signed: false }).success).toBe(false)
    expect(createScopedDelegationRequestSchema.safeParse({ ...draft, signed: 'oui' }).success).toBe(false)
    const { signed: _s, ...unsigned } = draft
    expect(createScopedDelegationRequestSchema.safeParse(unsigned).success).toBe(false)
  })

  it('refuse la portée « campaign » (elle a son propre chemin, contenus relus) et une portée inconnue', () => {
    expect(createScopedDelegationRequestSchema.safeParse({ ...draft, scope: 'campaign' }).success).toBe(false)
    expect(createScopedDelegationRequestSchema.safeParse({ ...draft, scope: 'everything' }).success).toBe(false)
    // LinkedIn se signe par sa propre route (borne par jour, voie fournisseur) : jamais par ce schéma e-mail.
    expect(createScopedDelegationRequestSchema.safeParse({ ...draft, scope: 'linkedin_send' }).success).toBe(false)
  })

  it('refuse un mandat sans borne au-delà des plafonds absolus', () => {
    expect(
      createScopedDelegationRequestSchema.safeParse({ ...draft, duration_days: DELEGATION_MAX_DAYS + 1 }).success,
    ).toBe(false)
  })

  it('renouveler se re-signe', () => {
    expect(renewDelegationRequestSchema.safeParse({ duration_days: 7, signed: true }).success).toBe(true)
    expect(renewDelegationRequestSchema.safeParse({ duration_days: 7 }).success).toBe(false)
  })
})

describe('#4016 L5 — les bornes sont un réglage PAR PLAN (GA-26 : un seul endroit)', () => {
  it('chaque plan a ses bornes, et aucune ne dépasse les plafonds absolus de c89', () => {
    for (const bounds of Object.values(SEND_BOUNDS_BY_PLAN)) {
      expect(bounds.mandate_max_days).toBeLessThanOrEqual(DELEGATION_MAX_DAYS)
      expect(bounds.bulk_send_max).toBeGreaterThan(0)
    }
  })

  it('un plan inconnu ou illisible retombe sur le PLANCHER, jamais sur le plafond', () => {
    expect(sendBoundsOfPlan(null)).toEqual(SEND_BOUNDS_FLOOR)
    expect(sendBoundsOfPlan('plan-inexistant')).toEqual(SEND_BOUNDS_FLOOR)
    expect(sendBoundsOfPlan('__proto__')).toEqual(SEND_BOUNDS_FLOOR)
    expect(sendBoundsOfPlan('growth')).toBe(SEND_BOUNDS_BY_PLAN.growth)
  })

  it('le dépassement d’une borne de plan est NOMMÉ', () => {
    const bounds = { bulk_send_max: 50, mandate_max_days: 10, mandate_max_messages: 20, mandate_max_contacts: 1 }
    expect(exceedsPlanBounds({ duration_days: 11, max_messages: 1, contact_ids: [] }, bounds)).toBe('duration')
    expect(exceedsPlanBounds({ duration_days: 1, max_messages: 21, contact_ids: [] }, bounds)).toBe('volume')
    expect(exceedsPlanBounds({ duration_days: 1, max_messages: 1, contact_ids: ['a', 'b'] }, bounds)).toBe('contacts')
    expect(exceedsPlanBounds({ duration_days: 10, max_messages: 20, contact_ids: ['a'] }, bounds)).toBeNull()
  })
})
