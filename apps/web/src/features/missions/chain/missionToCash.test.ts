import type { InvoiceReadiness } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  MISSION_CHAIN_STATES,
  MISSION_TO_CASH_STAGES,
  currentMissionToCashStage,
  deriveMissionToCash,
  missionToCashNoGo,
  type MissionChainInput,
  type MissionToCashStage,
} from './missionChain'

/**
 * #2421 — LA TIMELINE MISSION-TO-CASH, quatorze étapes SOUS les cinq maillons.
 *
 * Ce qui se vérifie ici est la RÈGLE de chaque cas de recette de l'issue (flux
 * normal, CRA absent, PO absent, facture créée non envoyée, paiement partiel,
 * connecteur en panne, forfait, non-applicable, litige, owner absent) — et la
 * garde NO-GO : jamais « facturation en cours » sans l'étape exacte, le blocage,
 * le responsable et la preuve.
 */

const NOW = new Date('2026-09-16T12:00:00.000Z')

function readiness(overrides: Partial<InvoiceReadiness> = {}): InvoiceReadiness {
  return {
    missionId: '11111111-1111-4111-8111-111111111111',
    missionLabel: 'Migration du socle applicatif',
    accountName: 'Cliente Industrie',
    accountId: '22222222-2222-4222-8222-222222222222',
    periodMonth: '2026-08-01',
    state: 'blocked',
    blockers: [],
    days: null,
    preparedAmountCents: null,
    invoicedAt: null,
    invoiceReference: null,
    invoicedAmountCents: null,
    dueOn: null,
    remindersSent: 0,
    lastReminderAt: null,
    paidAt: null,
    paidAmountCents: null,
    disputedAt: null,
    disputeReason: null,
    disputeResolvedAt: null,
    ...overrides,
  }
}

function input(overrides: Partial<MissionChainInput> = {}): MissionChainInput {
  return {
    mission: {
      renewal: 'far',
      status: 'active',
      created_at: '2026-05-02T09:00:00.000Z',
      started_on: '2026-05-15',
      ends_on: '2026-12-31',
      stage_entered_at: '2026-05-15T08:00:00.000Z',
      ownerName: 'Claire Porteur',
    },
    readiness: readiness(),
    readinessKnown: true,
    consultantId: '33333333-3333-4333-8333-333333333333',
    consultantName: 'Paul Consultant',
    now: NOW,
    ...overrides,
  }
}

function stageOf(stages: readonly MissionToCashStage[], name: (typeof MISSION_TO_CASH_STAGES)[number]) {
  const found = stages.find(item => item.stage === name)
  if (!found) throw new Error(`La timeline ne rend pas l’étape « ${name} ».`)
  return found
}

const PAID_IN_FULL = readiness({
  state: 'invoiced',
  preparedAmountCents: 1_200_000,
  invoicedAt: '2026-09-02T10:00:00.000Z',
  invoiceReference: 'F-2026-0812',
  invoicedAmountCents: 1_200_000,
  dueOn: '2026-10-02',
  paidAt: '2026-09-10T10:00:00.000Z',
  paidAmountCents: 1_200_000,
})

describe('#2421.1 — quatorze étapes nommées, toujours rendues, dans l’ordre', () => {
  it('rend les quatorze étapes de la mission à la clôture, même sans aucune donnée', () => {
    const stages = deriveMissionToCash(input({ readiness: undefined, readinessKnown: false }))
    expect(stages.map(item => item.stage)).toEqual([...MISSION_TO_CASH_STAGES])
    expect(MISSION_TO_CASH_STAGES).toHaveLength(14)
  })

  it('rattache chaque étape à UN des cinq maillons (une seule chaîne, GA-26) — ou au dossier lui-même', () => {
    for (const item of deriveMissionToCash(input())) {
      expect([null, 'timesheet', 'billable', 'invoice', 'collection']).toContain(item.step)
    }
  })
})

describe('#2421.2 — sept états distincts, jamais repliés', () => {
  it('porte les sept valeurs demandées (non due, attendue, en cours, terminée, bloquée, non applicable, inconnue)', () => {
    expect([...MISSION_CHAIN_STATES].sort()).toEqual(
      ['blocked', 'done', 'in_progress', 'not_applicable', 'not_due', 'not_measured', 'pending'].sort(),
    )
  })

  it('flux normal : tout est terminé jusqu’au paiement, l’envoi et le rapprochement restent INCONNUS (jamais « fait » d’un silence)', () => {
    const stages = deriveMissionToCash(input({ readiness: PAID_IN_FULL }))
    expect(stageOf(stages, 'mission_active').state).toBe('done')
    expect(stageOf(stages, 'period_delivered').state).toBe('done')
    expect(stageOf(stages, 'timesheet_validated').state).toBe('done')
    expect(stageOf(stages, 'invoice_created').state).toBe('done')
    expect(stageOf(stages, 'invoice_sent').state).toBe('not_measured')
    expect(stageOf(stages, 'payment_received').state).toBe('done')
    expect(stageOf(stages, 'payment_reconciled').state).toBe('not_measured')
    expect(stageOf(stages, 'period_closed').state).toBe('done')
  })

  it('une période pas encore finie est « en cours », la suite « non due »', () => {
    const stages = deriveMissionToCash(input({ readiness: readiness({ periodMonth: '2026-09-01' }) }))
    expect(stageOf(stages, 'period_delivered').state).toBe('in_progress')
    expect(stageOf(stages, 'invoice_due').state).toBe('not_due')
  })
})

describe('les cas de recette de l’issue', () => {
  it('CRA absent : la soumission est BLOQUÉE et nomme le bloqueur, la validation attend', () => {
    const stages = deriveMissionToCash(input({ readiness: readiness({ blockers: ['missing_timesheet'] }) }))
    expect(stageOf(stages, 'timesheet_submitted')).toMatchObject({ state: 'blocked', blocker: 'missing_timesheet' })
    expect(stageOf(stages, 'timesheet_validated').state).toBe('pending')
  })

  it('PO absent : le CA facturable est bloqué par le bon de commande, pas le relevé', () => {
    const stages = deriveMissionToCash(input({ readiness: readiness({ blockers: ['missing_po'] }) }))
    expect(stageOf(stages, 'timesheet_validated').state).toBe('done')
    expect(stageOf(stages, 'billable_computed')).toMatchObject({ state: 'blocked', blocker: 'missing_po' })
    expect(currentMissionToCashStage(stages)?.stage).toBe('billable_computed')
  })

  it('facture créée non envoyée : créée PROUVÉE avec sa source, envoi inconnu avec sa raison', () => {
    const stages = deriveMissionToCash(
      input({
        readiness: readiness({ state: 'invoiced', invoicedAt: '2026-09-02T10:00:00.000Z', invoiceReference: 'F-1' }),
      }),
    )
    expect(stageOf(stages, 'invoice_created').proof).toMatchObject({ key: 'invoicedProven', reference: 'F-1' })
    expect(stageOf(stages, 'invoice_sent')).toMatchObject({ state: 'not_measured', reasonKey: 'sendNotTracked' })
  })

  it('c80 — une facture DÉCLARÉE nomme qui l’a déclarée, jamais « prouvée »', () => {
    const stages = deriveMissionToCash(
      input({
        readiness: readiness({
          state: 'invoiced_declared',
          invoicedAt: '2026-09-02T10:00:00.000Z',
          invoicedByName: 'Claire Porteur',
        }),
      }),
    )
    expect(stageOf(stages, 'invoice_created').proof).toMatchObject({ key: 'invoicedDeclared', by: 'Claire Porteur' })
  })

  it('paiement partiel : le paiement est « en cours », la période n’est PAS clôturée', () => {
    const stages = deriveMissionToCash(
      input({ readiness: { ...PAID_IN_FULL, paidAmountCents: 400_000, dueOn: '2026-10-02' } }),
    )
    expect(stageOf(stages, 'payment_received')).toMatchObject({ state: 'in_progress', reasonKey: 'partialPayment' })
    expect(stageOf(stages, 'period_closed').state).not.toBe('done')
  })

  it('connecteur en panne (lecture échouée) : tout ce qui dépend du mois est INCONNU, jamais « fait »', () => {
    const stages = deriveMissionToCash(input({ readiness: undefined, readinessKnown: false }))
    for (const name of ['timesheet_submitted', 'invoice_created', 'payment_received'] as const) {
      expect(stageOf(stages, name)).toMatchObject({ state: 'not_measured', reasonKey: 'readingFailed' })
    }
    expect(stageOf(stages, 'mission_created').state).toBe('done')
  })

  it('forfait (mois non dû) : relevé et encaissement mensuels sont « non applicables »', () => {
    const stages = deriveMissionToCash(input({ readiness: readiness({ state: 'not_due' }) }))
    expect(stageOf(stages, 'timesheet_submitted').state).toBe('not_applicable')
    expect(stageOf(stages, 'payment_received').state).toBe('not_applicable')
  })

  it('litige : le paiement est bloqué par le litige, nommé', () => {
    const stages = deriveMissionToCash(
      input({
        readiness: {
          ...PAID_IN_FULL,
          paidAt: null,
          paidAmountCents: null,
          disputedAt: '2026-09-05T10:00:00.000Z',
          disputeReason: 'jours contestés',
        },
      }),
    )
    expect(stageOf(stages, 'payment_received')).toMatchObject({ state: 'blocked', reasonKey: 'disputed' })
  })

  it('échéance dépassée : l’échéance est bloquée « en retard », depuis la date d’échéance', () => {
    const stages = deriveMissionToCash(
      input({ readiness: { ...PAID_IN_FULL, paidAt: null, paidAmountCents: null, dueOn: '2026-09-01' } }),
    )
    expect(stageOf(stages, 'invoice_due')).toMatchObject({
      state: 'blocked',
      reasonKey: 'overdue',
      since: '2026-09-01',
    })
  })
})

describe('#2421.6 — chaque étape a un responsable par RÈGLE ; sans lui, elle devient une exception', () => {
  it('le relevé revient au consultant, la facture au porteur de la mission — noms résolus, jamais inventés', () => {
    const stages = deriveMissionToCash(input({ readiness: readiness({ blockers: ['missing_timesheet'] }) }))
    expect(stageOf(stages, 'timesheet_submitted').owner).toEqual({ rule: 'consultant', name: 'Paul Consultant' })
    expect(stageOf(stages, 'invoice_created').owner).toEqual({ rule: 'mission_owner', name: 'Claire Porteur' })
  })

  it('owner absent : une étape OUVERTE sans responsable devient une exception', () => {
    const base = input()
    const stages = deriveMissionToCash({
      ...base,
      mission: { ...base.mission, ownerName: null },
      readiness: readiness({ blockers: ['missing_po'] }),
    })
    const billable = stageOf(stages, 'billable_computed')
    expect(billable.owner.name).toBeNull()
    expect(billable.exception).toBe(true)
    // Une étape TERMINÉE sans responsable n'est pas une exception : il n'y a plus rien à faire.
    expect(stageOf(stages, 'mission_created').exception).toBe(false)
  })

  it('un porteur NON LU (API plus ancienne) n’accuse personne : pas d’exception inventée', () => {
    const base = input()
    const { ownerName: _omitted, ...withoutOwner } = base.mission
    const stages = deriveMissionToCash({
      ...base,
      mission: withoutOwner,
      readiness: readiness({ blockers: ['missing_po'] }),
    })
    expect(stageOf(stages, 'billable_computed').exception).toBe(true) // bloquée, donc exception quand même
    expect(stageOf(stages, 'invoice_prepared').exception).toBe(false) // attendue, porteur inconnu ≠ absent
  })
})

describe('#2421.3 — durée dans l’étape et preuve', () => {
  it('une étape attendue dit DEPUIS QUAND (fin de période), une étape faite dit sa PREUVE datée', () => {
    const stages = deriveMissionToCash(
      input({ readiness: readiness({ state: 'ready', preparedAmountCents: 900_000 }) }),
    )
    expect(stageOf(stages, 'invoice_created')).toMatchObject({ state: 'pending', since: '2026-09-01' })
    expect(stageOf(stages, 'invoice_prepared').proof).toMatchObject({ key: 'prepared', amountCents: 900_000 })
    expect(stageOf(stages, 'mission_created').proof).toMatchObject({ key: 'created', at: '2026-05-02T09:00:00.000Z' })
  })
})

describe('#2421.7 — NO-GO : jamais « en cours » sans étape exacte, blocage, responsable et preuve', () => {
  const cases: Record<string, MissionChainInput> = {
    normal: input({ readiness: PAID_IN_FULL }),
    craAbsent: input({ readiness: readiness({ blockers: ['missing_timesheet'] }) }),
    poAbsent: input({ readiness: readiness({ blockers: ['missing_po'] }) }),
    forfait: input({ readiness: readiness({ state: 'not_due' }) }),
    lectureEchouee: input({ readiness: undefined, readinessKnown: false }),
    sansLigne: input({ readiness: undefined }),
    ownerAbsent: { ...input(), mission: { ...input().mission, ownerName: null } },
    onboarding: { ...input(), mission: { ...input().mission, status: 'onboarding' } },
  }

  for (const [name, value] of Object.entries(cases)) {
    it(`cas « ${name} » : aucune violation`, () => {
      expect(missionToCashNoGo(deriveMissionToCash(value))).toEqual([])
    })
  }

  it('la garde sait dire NON : une étape bloquée sans motif, ouverte sans responsable ni exception, ou faite sans preuve', () => {
    const stage = stageOf(deriveMissionToCash(input()), 'billable_computed')
    const violations = missionToCashNoGo([
      { ...stage, state: 'blocked', blocker: null, reasonKey: null },
      {
        ...stage,
        stage: 'invoice_prepared',
        state: 'pending',
        owner: { rule: 'mission_owner', name: null },
        exception: false,
      },
      { ...stage, stage: 'invoice_created', state: 'done', proof: null },
    ])
    expect(violations).toEqual([
      'billable_computed:blockedWithoutReason',
      'invoice_prepared:openWithoutOwner',
      'invoice_created:doneWithoutProof',
    ])
  })

  it('l’étape actuelle est la première qui n’est ni faite ni sans objet — jamais une étape vague', () => {
    const stages = deriveMissionToCash(input({ readiness: readiness({ blockers: ['missing_timesheet'] }) }))
    expect(currentMissionToCashStage(stages)?.stage).toBe('timesheet_submitted')
  })
})
