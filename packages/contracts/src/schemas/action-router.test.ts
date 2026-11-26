import { describe, expect, it } from 'vitest'

import {
  ACTION_DISPATCH_BULK_MAX,
  actionDispatchResultSchema,
  actionIntentSchema,
  actionIntentTypeSchema,
  createMailDraftIntentSchema,
  dispatchBulkRequestSchema,
  dispatchBulkResponseSchema,
  enrichContactIntentSchema,
  generateMessageIntentSchema,
  pinMemoryFactIntentSchema,
  updateRoutineIntentSchema,
  updateSettingIntentSchema,
} from './action-router.js'

const UUID = '11111111-1111-1111-1111-111111111111'
const OTHER_UUID = '22222222-2222-2222-2222-222222222222'
const AT = '2026-08-01T09:00:00.000Z'

describe('ActionIntent (discriminated union)', () => {
  it('accepts a send_email intent (draft-based, subject/body optional)', () => {
    const intent = actionIntentSchema.parse({ type: 'send_email', contactId: UUID })
    expect(intent.type).toBe('send_email')
  })

  it('accepts a create_crm_task intent with provider + note', () => {
    const intent = actionIntentSchema.parse({
      type: 'create_crm_task',
      contactId: UUID,
      crmProvider: 'hubspot',
      note: 'Rappeler après le POC',
    })
    expect(intent).toMatchObject({ type: 'create_crm_task', crmProvider: 'hubspot' })
  })

  it('accepts create_crm_task targeting pipedrive/attio (#1931 — crmTaskProviderSchema widened)', () => {
    expect(
      actionIntentSchema.parse({ type: 'create_crm_task', contactId: UUID, crmProvider: 'pipedrive' }),
    ).toMatchObject({ crmProvider: 'pipedrive' })
    expect(actionIntentSchema.parse({ type: 'create_crm_task', contactId: UUID, crmProvider: 'attio' })).toMatchObject({
      crmProvider: 'attio',
    })
  })

  it('rejects a create_crm_task with an unknown CRM provider', () => {
    expect(() =>
      actionIntentSchema.parse({ type: 'create_crm_task', contactId: UUID, crmProvider: 'unknown_crm' }),
    ).toThrow()
  })

  it('accepts enrich_contact / schedule_reminder / snooze', () => {
    expect(actionIntentSchema.parse({ type: 'enrich_contact', contactId: UUID }).type).toBe('enrich_contact')
    expect(actionIntentSchema.parse({ type: 'schedule_reminder', contactId: UUID, at: AT }).type).toBe(
      'schedule_reminder',
    )
    expect(actionIntentSchema.parse({ type: 'snooze', targetId: UUID, until: AT }).type).toBe('snooze')
  })

  it('rejects an unknown intent type', () => {
    expect(() => actionIntentSchema.parse({ type: 'delete_everything', contactId: UUID })).toThrow()
  })

  it('rejects a non-uuid contactId and a non-datetime reminder time', () => {
    expect(() => actionIntentSchema.parse({ type: 'enrich_contact', contactId: 'nope' })).toThrow()
    expect(() => actionIntentSchema.parse({ type: 'schedule_reminder', contactId: UUID, at: 'tomorrow' })).toThrow()
  })

  it('accepts an account-scoped reminder (a besoin belongs to a company, not a person)', () => {
    const intent = actionIntentSchema.parse({ type: 'schedule_reminder', accountId: UUID, at: AT })
    expect(intent).toMatchObject({ type: 'schedule_reminder', accountId: UUID })
  })

  it('rejects a reminder with no target and a reminder with both targets', () => {
    expect(() => actionIntentSchema.parse({ type: 'schedule_reminder', at: AT })).toThrow()
    expect(() =>
      actionIntentSchema.parse({ type: 'schedule_reminder', contactId: UUID, accountId: OTHER_UUID, at: AT }),
    ).toThrow()
  })
})

describe('idempotencyKey (D520 — deux clics, un seul effet)', () => {
  it('is optional on every intent type — an omitted key keeps the pre-existing behaviour', () => {
    // Regression guard: every caller that shipped before this field existed
    // must keep validating byte-identically.
    expect(actionIntentSchema.parse({ type: 'send_email', contactId: UUID }).idempotencyKey).toBeUndefined()
    expect(actionIntentSchema.parse({ type: 'notify_user', title: 'Hello' }).idempotencyKey).toBeUndefined()
    expect(actionIntentSchema.parse({ type: 'snooze', targetId: UUID, until: AT }).idempotencyKey).toBeUndefined()
  })

  it('accepts an idempotencyKey on each intent type', () => {
    const key = 'attempt-2026-08-30-abc123'
    expect(actionIntentSchema.parse({ type: 'send_email', contactId: UUID, idempotencyKey: key })).toMatchObject({
      idempotencyKey: key,
    })
    expect(
      actionIntentSchema.parse({
        type: 'create_crm_task',
        contactId: UUID,
        crmProvider: 'hubspot',
        idempotencyKey: key,
      }),
    ).toMatchObject({ idempotencyKey: key })
    expect(actionIntentSchema.parse({ type: 'enrich_contact', contactId: UUID, idempotencyKey: key })).toMatchObject({
      idempotencyKey: key,
    })
    expect(
      actionIntentSchema.parse({ type: 'schedule_reminder', contactId: UUID, at: AT, idempotencyKey: key }),
    ).toMatchObject({ idempotencyKey: key })
    expect(actionIntentSchema.parse({ type: 'snooze', targetId: UUID, until: AT, idempotencyKey: key })).toMatchObject({
      idempotencyKey: key,
    })
    expect(
      actionIntentSchema.parse({
        type: 'create_calendar_event',
        title: 'Point client',
        startsAt: AT,
        idempotencyKey: key,
      }),
    ).toMatchObject({ idempotencyKey: key })
    expect(
      actionIntentSchema.parse({ type: 'create_crm_note', contactId: UUID, note: 'Appelé', idempotencyKey: key }),
    ).toMatchObject({ idempotencyKey: key })
    expect(actionIntentSchema.parse({ type: 'notify_user', title: 'Hello', idempotencyKey: key })).toMatchObject({
      idempotencyKey: key,
    })
  })

  it('rejects an empty idempotencyKey (a blank string is not a valid attempt id)', () => {
    expect(() => actionIntentSchema.parse({ type: 'send_email', contactId: UUID, idempotencyKey: '' })).toThrow()
    expect(() => actionIntentSchema.parse({ type: 'send_email', contactId: UUID, idempotencyKey: '   ' })).toThrow()
  })

  it('rejects an idempotencyKey over 200 characters', () => {
    expect(() =>
      actionIntentSchema.parse({ type: 'send_email', contactId: UUID, idempotencyKey: 'x'.repeat(201) }),
    ).toThrow()
  })
})

describe('ActionDispatchResult', () => {
  it('validates each status and keeps optional reason/externalRef', () => {
    const done = actionDispatchResultSchema.parse({ type: 'enrich_contact', status: 'done', externalRef: 'c1' })
    expect(done.status).toBe('done')
    const skipped = actionDispatchResultSchema.parse({
      type: 'create_crm_task',
      status: 'skipped',
      reason: 'CRM hubspot non connecté',
    })
    expect(skipped.reason).toContain('non connecté')
  })

  it('rejects an unknown status', () => {
    expect(() => actionDispatchResultSchema.parse({ type: 'snooze', status: 'maybe' })).toThrow()
  })

  /**
   * #1959.9 / #1959.10 — UNE CLÉ DÉJÀ RÉCLAMÉE DIT QUI ET QUAND.
   *
   * « Une action identique (même clé) est déjà en cours de traitement » ne
   * nomme personne et ne donne aucune heure : la personne devant l'écran ne
   * sait ni à qui parler ni si l'effet a eu lieu. Le routeur lit déjà
   * `user_id` (migration `ActionDispatchAttemptAuthor`) et `completed_at` —
   * il ne les rendait simplement pas.
   */
  it('#1959.9/.10 — porte l’auteur et l’heure RÉELLE de la tentative déjà réclamée', () => {
    const claimed = actionDispatchResultSchema.parse({
      type: 'schedule_reminder',
      status: 'done',
      claim: { actor: 'Marc Dubois', completedAt: '2026-09-15T12:32:00.000Z', self: false },
    })
    expect(claimed.claim).toEqual({ actor: 'Marc Dubois', completedAt: '2026-09-15T12:32:00.000Z', self: false })
  })

  /**
   * « Non mesuré n'est jamais 0 » sur une heure : tant que l'effet est EN VOL,
   * `completedAt` est `null` — jamais « maintenant », jamais l'heure de la
   * réclamation, qui ferait croire à une exécution terminée.
   */
  it('#1959.10 — un effet encore en vol n’invente pas d’heure d’exécution', () => {
    const claimed = actionDispatchResultSchema.parse({
      type: 'notify_user',
      status: 'skipped',
      claim: { actor: null, completedAt: null, self: true },
    })
    expect(claimed.claim?.completedAt).toBeNull()
  })

  it('#1959.9 — une heure d’exécution qui n’est pas une date ISO est refusée', () => {
    expect(() =>
      actionDispatchResultSchema.parse({
        type: 'notify_user',
        status: 'done',
        claim: { actor: 'Marc', completedAt: 'tout à l’heure', self: false },
      }),
    ).toThrow()
  })
})

describe('bulk dispatch', () => {
  it('accepts a list of intents up to the cap', () => {
    const req = dispatchBulkRequestSchema.parse({
      intents: [
        { type: 'send_email', contactId: UUID },
        { type: 'snooze', targetId: OTHER_UUID, until: AT },
      ],
    })
    expect(req.intents).toHaveLength(2)
  })

  it('rejects an empty list and a list over the cap', () => {
    expect(() => dispatchBulkRequestSchema.parse({ intents: [] })).toThrow()
    const tooMany = Array.from({ length: ACTION_DISPATCH_BULK_MAX + 1 }, () => ({
      type: 'enrich_contact' as const,
      contactId: UUID,
    }))
    expect(() => dispatchBulkRequestSchema.parse({ intents: tooMany })).toThrow()
  })

  it('validates the aggregated response shape', () => {
    const res = dispatchBulkResponseSchema.parse({
      results: [{ type: 'send_email', status: 'done' }],
      summary: { total: 1, done: 1, queued: 0, skipped: 0, failed: 0 },
    })
    expect(res.summary.total).toBe(1)
  })
})

describe('#1931 — enrichContactIntentSchema.mode (queued, opt-in, additive)', () => {
  it('mode is absent by default — byte-identical to the pre-existing synchronous behaviour', () => {
    expect(enrichContactIntentSchema.parse({ type: 'enrich_contact', contactId: UUID }).mode).toBeUndefined()
  })

  it('accepts mode: "queued"', () => {
    expect(enrichContactIntentSchema.parse({ type: 'enrich_contact', contactId: UUID, mode: 'queued' }).mode).toBe(
      'queued',
    )
  })

  it('rejects any other mode literal', () => {
    expect(() => enrichContactIntentSchema.parse({ type: 'enrich_contact', contactId: UUID, mode: 'async' })).toThrow()
  })
})

describe('#1931 — the five standalone chat-card intent schemas', () => {
  it('generateMessageIntentSchema accepts a channel and an optional angle', () => {
    expect(
      generateMessageIntentSchema.parse({ type: 'generate_message', contactId: UUID, channel: 'email' }),
    ).toMatchObject({ type: 'generate_message', channel: 'email' })
    expect(() =>
      generateMessageIntentSchema.parse({ type: 'generate_message', contactId: UUID, channel: 'fax' }),
    ).toThrow()
  })

  it('createMailDraftIntentSchema requires a real email and non-empty subject/body', () => {
    const draft = createMailDraftIntentSchema.parse({
      type: 'create_mail_draft',
      to: 'julie@example.com',
      subject: 'Suite à notre échange',
      body: 'Bonjour Julie,',
    })
    expect(draft.to).toBe('julie@example.com')
    expect(() =>
      createMailDraftIntentSchema.parse({ type: 'create_mail_draft', to: 'nope', subject: 'x', body: 'y' }),
    ).toThrow()
  })

  it('createMailDraftIntentSchema : #2394.36 — un threadId DÉCLARÉ ne peut pas être vide', () => {
    const reply = createMailDraftIntentSchema.parse({
      type: 'create_mail_draft',
      to: 'julie@example.com',
      subject: 'Re: Suite',
      body: 'Bonjour Julie,',
      threadId: 't-123',
    })
    expect(reply.threadId).toBe('t-123')
    // Absent reste autorisé (un nouveau message n'a pas de fil) ; VIDE ne l'est plus.
    expect(
      createMailDraftIntentSchema.parse({
        type: 'create_mail_draft',
        to: 'julie@example.com',
        subject: 'Suite',
        body: 'Bonjour Julie,',
      }).threadId,
    ).toBeUndefined()
    expect(() =>
      createMailDraftIntentSchema.parse({
        type: 'create_mail_draft',
        to: 'julie@example.com',
        subject: 'Suite',
        body: 'Bonjour Julie,',
        threadId: '',
      }),
    ).toThrow()
  })

  it('updateRoutineIntentSchema accepts a partial patch — every field but the key is optional', () => {
    expect(updateRoutineIntentSchema.parse({ type: 'update_routine', key: 'morning_brief' })).toMatchObject({
      key: 'morning_brief',
    })
    expect(
      updateRoutineIntentSchema.parse({ type: 'update_routine', key: 'morning_brief', weekday: 1, hour: 8 }),
    ).toMatchObject({ weekday: 1, hour: 8 })
    expect(() =>
      updateRoutineIntentSchema.parse({ type: 'update_routine', key: 'morning_brief', weekday: 8 }),
    ).toThrow()
  })

  it('updateSettingIntentSchema accepts a boolean or numeric new value', () => {
    expect(
      updateSettingIntentSchema.parse({ type: 'update_setting', screen: 'pipeline', field: 'sla', newValue: 5 }),
    ).toMatchObject({ newValue: 5 })
    expect(
      updateSettingIntentSchema.parse({
        type: 'update_setting',
        screen: 'notifications',
        field: 'email',
        newValue: true,
      }),
    ).toMatchObject({ newValue: true })
  })

  it('pinMemoryFactIntentSchema requires a non-empty fact, accountId optional', () => {
    expect(pinMemoryFactIntentSchema.parse({ type: 'pin_memory_fact', fact: 'Facturation à 45 jours' })).toMatchObject({
      fact: 'Facturation à 45 jours',
    })
    expect(() => pinMemoryFactIntentSchema.parse({ type: 'pin_memory_fact', fact: '' })).toThrow()
  })

  it('L2 (#1931) — all five ARE members of actionIntentSchema: the router now has a handler for each', () => {
    // `actionIntentSchema` is a `ZodEffects` (the discriminated union piped
    // through `.superRefine`), so it has no `.options` of its own — `safeParse`
    // is the black-box way to ask "does this discriminant exist here?" without
    // reaching into zod's internals. L1 asserted `false` here, on purpose: the
    // union and the router's exhaustive switch must move TOGETHER, and L2 is
    // the lot that gives each of the five an effect.
    expect(actionIntentSchema.safeParse({ type: 'generate_message', contactId: UUID, channel: 'email' }).success).toBe(
      true,
    )
    expect(
      actionIntentSchema.safeParse({
        type: 'create_mail_draft',
        to: 'julie@example.com',
        subject: 'x',
        body: 'y',
      }).success,
    ).toBe(true)
    expect(actionIntentSchema.safeParse({ type: 'update_routine', key: 'morning_brief' }).success).toBe(true)
    expect(
      actionIntentSchema.safeParse({ type: 'update_setting', screen: 'pipeline', field: 'sla', newValue: 5 }).success,
    ).toBe(true)
    expect(actionIntentSchema.safeParse({ type: 'pin_memory_fact', fact: 'x' }).success).toBe(true)
  })

  it('sait dire NON — a malformed member of the five is still refused by the union', () => {
    expect(
      actionIntentSchema.safeParse({ type: 'create_mail_draft', to: 'nope', subject: 'x', body: 'y' }).success,
    ).toBe(false)
    expect(actionIntentSchema.safeParse({ type: 'pin_memory_fact', fact: '' }).success).toBe(false)
  })
})

describe('L2 (#1931, I4) — a dispatch result carries the debit it OBSERVED, never the estimate', () => {
  it('`creditsDebited` is optional — absent means the handler never debits (byte-identical for the eight old intents)', () => {
    expect(actionDispatchResultSchema.parse({ type: 'notify_user', status: 'done' }).creditsDebited).toBeUndefined()
  })

  it('accepts an observed debit, including an honest 0 (a lookup that found nothing)', () => {
    expect(
      actionDispatchResultSchema.parse({ type: 'enrich_contact', status: 'done', creditsDebited: 0 }).creditsDebited,
    ).toBe(0)
    expect(
      actionDispatchResultSchema.parse({ type: 'enrich_contact', status: 'done', creditsDebited: 1 }).creditsDebited,
    ).toBe(1)
  })

  it('refuses a negative or fractional debit — a refund is not a dispatch outcome', () => {
    expect(() =>
      actionDispatchResultSchema.parse({ type: 'enrich_contact', status: 'done', creditsDebited: -1 }),
    ).toThrow()
    expect(() =>
      actionDispatchResultSchema.parse({ type: 'enrich_contact', status: 'done', creditsDebited: 0.5 }),
    ).toThrow()
  })

  it('a generated message draft travels as an ARTIFACT — its text, never a send receipt', () => {
    const parsed = actionDispatchResultSchema.parse({
      type: 'generate_message',
      status: 'done',
      artifact: { kind: 'message_draft', channel: 'email', subject: 'Suite', body: 'Bonjour', angle: null },
    })
    expect(parsed.artifact).toEqual({
      kind: 'message_draft',
      channel: 'email',
      subject: 'Suite',
      body: 'Bonjour',
      angle: null,
    })
    expect(() =>
      actionDispatchResultSchema.parse({ type: 'generate_message', status: 'done', artifact: { kind: 'sent_email' } }),
    ).toThrow()
  })

  it('all five ARE known ActionIntentType literals — INTENT_REACH (action-os.ts) can classify them', () => {
    const known = new Set(actionIntentTypeSchema.options)
    expect(known.has('generate_message')).toBe(true)
    expect(known.has('create_mail_draft')).toBe(true)
    expect(known.has('update_routine')).toBe(true)
    expect(known.has('update_setting')).toBe(true)
    expect(known.has('pin_memory_fact')).toBe(true)
  })
})
