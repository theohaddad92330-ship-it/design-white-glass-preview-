import { describe, expect, it } from 'vitest'

import {
  APPROVAL_THRESHOLD_UNBOUNDED,
  APPROVAL_TTL_MS,
  approvalSettingsSchema,
  updateApprovalSettingsSchema,
  writesIntoClientTool,
  cancelCardRequestSchema,
  confirmCardRequestSchema,
  defaultSnoozeUntil,
  modifyCardRequestSchema,
  rejectCardRequestSchema,
  reachesOutsideProduct,
  retryCardRequestSchema,
  retryWorkflowRunRequestSchema,
  snoozeCardRequestSchema,
  workflowRunStatusSchema,
  workflowTriggerSchema,
} from './action-os.js'

describe('#1931 — workflowRunStatusSchema grows in FIN, GA-08', () => {
  it('the eleven statuses of #1931 are present, `snoozed`/`superseded` right after `unknown`', () => {
    const options = workflowRunStatusSchema.options
    expect(options.slice(9, 11)).toEqual(['snoozed', 'superseded'])
  })

  it('#2276.22 / #2276.23 — `draft` and `to_confirm` (the composite job) come LAST', () => {
    const options = workflowRunStatusSchema.options
    expect(options.slice(-2)).toEqual(['draft', 'to_confirm'])
    expect(options).toHaveLength(13)
  })

  it('no pre-existing status moved or was removed', () => {
    const options = workflowRunStatusSchema.options
    expect(options.slice(0, 9)).toEqual([
      'planned',
      'awaiting_approval',
      'running',
      'done',
      'partial',
      'failed',
      'cancelled',
      'blocked',
      'unknown',
    ])
  })
})

describe('#1931 — workflowTriggerSchema gains copilot_proposal LAST', () => {
  it('copilot_proposal follows the six original triggers', () => {
    const options = workflowTriggerSchema.options
    expect(options[6]).toBe('copilot_proposal')
  })

  it('#2276 — laura_job (the composite job) is the final literal', () => {
    const options = workflowTriggerSchema.options
    expect(options.at(-1)).toBe('laura_job')
    expect(options).toHaveLength(8)
  })
})

describe('#1931 — INTENT_REACH classifies the five new intents (reachesOutsideProduct)', () => {
  it('all five are INTERNAL — none of them reaches outside the product', () => {
    expect(reachesOutsideProduct('generate_message')).toBe(false)
    expect(reachesOutsideProduct('create_mail_draft')).toBe(false)
    expect(reachesOutsideProduct('update_routine')).toBe(false)
    expect(reachesOutsideProduct('update_setting')).toBe(false)
    expect(reachesOutsideProduct('pin_memory_fact')).toBe(false)
  })

  it('an existing external intent is unaffected — the table did not lose a value', () => {
    expect(reachesOutsideProduct('send_email')).toBe(true)
  })
})

describe('APPROVAL_TTL_MS — la constante unique (GA-26)', () => {
  it('vaut trois jours en millisecondes', () => {
    expect(APPROVAL_TTL_MS).toBe(3 * 24 * 60 * 60 * 1000)
  })
})

describe('defaultSnoozeUntil — demain 9h, pure', () => {
  it('avance d’un jour et fixe 9h00 pile — comparé à un calcul INDÉPENDANT, quel que soit le fuseau du runner', () => {
    const now = new Date('2026-09-12T14:37:00.000Z')
    const next = defaultSnoozeUntil(now)
    // Construit "demain 9h" par une voie DIFFÉRENTE (le constructeur multi-
    // arguments, pas `setDate`/`setHours`) pour ne pas comparer l'implémentation
    // à elle-même — et en LOCAL des deux côtés, pour rester juste quel que soit
    // le fuseau qui exécute la suite (leçon « tests qui mentent » — fuseau).
    const expected = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0, 0)
    expect(next.getTime()).toBe(expected.getTime())
  })

  it('est pure — ne mute pas `now`', () => {
    const now = new Date('2026-09-12T14:37:00.000Z')
    const before = now.getTime()
    defaultSnoozeUntil(now)
    expect(now.getTime()).toBe(before)
  })

  it('deux appels avec la même entrée rendent la même sortie', () => {
    const now = new Date('2026-09-12T14:37:00.000Z')
    expect(defaultSnoozeUntil(now).getTime()).toBe(defaultSnoozeUntil(now).getTime())
  })
})

describe('les six gestes de carte (#1931, #1959)', () => {
  it('confirmer — corps vide, rien d’autre accepté (le clic EST la décision)', () => {
    expect(confirmCardRequestSchema.parse({})).toEqual({})
    expect(() => confirmCardRequestSchema.parse({ extra: true })).toThrow()
  })

  it('refuser — raison optionnelle', () => {
    expect(rejectCardRequestSchema.parse({}).reason).toBeUndefined()
    expect(rejectCardRequestSchema.parse({ reason: 'Pas pertinent' }).reason).toBe('Pas pertinent')
  })

  it('reporter — `until` optionnel, une date invalide est rejetée', () => {
    expect(snoozeCardRequestSchema.parse({}).until).toBeUndefined()
    expect(snoozeCardRequestSchema.parse({ until: '2026-09-13T09:00:00.000Z' }).until).toBe('2026-09-13T09:00:00.000Z')
    expect(() => snoozeCardRequestSchema.parse({ until: 'demain' })).toThrow()
  })

  it('modifier — un patch ouvert (chaque type de carte a ses propres champs)', () => {
    const parsed = modifyCardRequestSchema.parse({ patch: { subject: 'Nouveau titre' } })
    expect(parsed.patch).toEqual({ subject: 'Nouveau titre' })
  })

  it('réessayer — corps vide, rien d’autre accepté', () => {
    expect(retryCardRequestSchema.parse({})).toEqual({})
    expect(() => retryCardRequestSchema.parse({ force: true })).toThrow()
  })

  it('annuler — raison optionnelle', () => {
    expect(cancelCardRequestSchema.parse({}).reason).toBeUndefined()
    expect(cancelCardRequestSchema.parse({ reason: 'Doublon' }).reason).toBe('Doublon')
  })
})

// #2865 — relancer un run MULTI-PAS (WorkflowRunnerService), distinct de la
// carte à un seul pas ci-dessus.
describe('relancer un run multi-pas (#2865)', () => {
  it('corps vide, rien d’autre accepté — le statut PERSISTÉ du run décide, pas l’appelant', () => {
    expect(retryWorkflowRunRequestSchema.parse({})).toEqual({})
    expect(() => retryWorkflowRunRequestSchema.parse({ stepKey: 'append_note' })).toThrow()
  })
})

/**
 * #4016 L6 (Louis 11/10/2026) — Action OS N4/N5 autonome : les seuils de
 * volume et de dépense se règlent JUSQU'À L'INFINI par l'admin. « Sans
 * plafond » est une valeur nommée, jamais un 0 ni un trou.
 */
describe('#4016 L6 — seuils d’approbation réglables jusqu’à « sans plafond »', () => {
  it('accepte « sans plafond » sur les deux seuils', () => {
    const parsed = approvalSettingsSchema.parse({
      defaultLevel: 'n5_extended_auto',
      bulkThreshold: APPROVAL_THRESHOLD_UNBOUNDED,
      spendThreshold: APPROVAL_THRESHOLD_UNBOUNDED,
    })
    expect(parsed.bulkThreshold).toBe(APPROVAL_THRESHOLD_UNBOUNDED)
  })

  it('accepte un seuil au-delà de l’ancien plafond (1000 cibles, 10 000 crédits)', () => {
    expect(() =>
      approvalSettingsSchema.parse({ defaultLevel: 'n4_bounded_auto', bulkThreshold: 50_000, spendThreshold: 250_000 }),
    ).not.toThrow()
  })

  it('SAIT DIRE NON — zéro, négatif, décimal ou au-delà de la colonne entière', () => {
    for (const bad of [0, -1, 1.5, APPROVAL_THRESHOLD_UNBOUNDED + 1]) {
      expect(() =>
        approvalSettingsSchema.parse({ defaultLevel: 'n4_bounded_auto', bulkThreshold: bad, spendThreshold: 20 }),
      ).toThrow()
    }
  })

  it('le corps de mise à jour : posture d’espace (N2 à N5) et seuils, `null` = revenir au défaut', () => {
    expect(
      updateApprovalSettingsSchema.parse({ defaultLevel: 'n5_extended_auto', bulkThreshold: null, spendThreshold: 40 }),
    ).toEqual({ defaultLevel: 'n5_extended_auto', bulkThreshold: null, spendThreshold: 40 })
    // `n0`/`n1` ne sont pas des postures d'espace : rien ici ne saurait les tenir.
    expect(() => updateApprovalSettingsSchema.parse({ defaultLevel: 'n1_prepare' })).toThrow()
  })
})

/**
 * #4016 L6 — « pour le CRM faut quand même un go du user » (Louis 11/10/2026).
 * Ce qui ÉCRIT dans l'outil du client se distingue de ce qui y LIT au prix d'un
 * crédit : seul le premier garde son plancher d'approbation, quelle que soit la
 * posture.
 */
describe('#4016 L6 — writesIntoClientTool', () => {
  it('les écritures CRM et les brouillons dans la boîte du commercial écrivent chez le client', () => {
    for (const intent of [
      'create_crm_task',
      'create_crm_note',
      'remove_crm_task',
      'close_crm_task',
      'create_mail_draft',
      'delete_draft',
    ] as const) {
      expect(writesIntoClientTool(intent)).toBe(true)
    }
  })

  it('un enrichissement LIT chez un fournisseur, il n’écrit pas chez le client', () => {
    expect(writesIntoClientTool('enrich_contact')).toBe(false)
  })

  it('n’attrape pas nos propres tables ni un envoi (tenu par ailleurs)', () => {
    expect(writesIntoClientTool('pin_memory_fact')).toBe(false)
    expect(writesIntoClientTool('update_opportunity')).toBe(false)
    expect(writesIntoClientTool('send_email')).toBe(false)
  })
})
