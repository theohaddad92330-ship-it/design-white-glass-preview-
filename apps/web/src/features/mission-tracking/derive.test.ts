import type { InvoiceReadiness } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import type { TimesheetLine } from '@/features/missions/api'
import {
  buildMissionTrackingRows,
  deriveCraStatus,
  deriveInvoicingStatus,
  deriveNextAction,
  derivePaymentStatus,
  trackingConcerns,
  isToAct,
  sortByUrgency,
  automationGaps,
  type MissionTrackingRow,
} from './derive'

const NOW = new Date('2026-08-31T12:00:00.000Z')

function timesheetLine(over: Partial<TimesheetLine> = {}): TimesheetLine {
  return {
    timesheetId: '11111111-1111-4111-8111-111111111111',
    missionId: 'mission-1',
    missionLabel: 'Transformation IT Europe',
    accountName: 'Airbus',
    consultantId: 'consultant-1',
    consultantName: 'D. Économique',
    periodMonth: '2026-08-01',
    status: 'validated',
    days: 20,
    expectedDays: 20,
    gap: 0,
    gapKind: 'none',
    gapExplanation: null,
    blocksInvoicing: false,
    validatedByClientAt: '2026-08-20T10:00:00.000Z',
    approverName: null,
    anomalies: [],
    remindersSent: 0,
    lastReminderAt: null,
    rejectedAt: null,
    rejectionReason: null,
    contestedDays: null,
    correctionDeadline: null,
    submittedByName: null,
    internalReviewedAt: null,
    internalReviewedByName: null,
    notApplicable: null,
    preDeadlineReminder: null,
    ...over,
  }
}

function readiness(over: Partial<InvoiceReadiness> = {}): InvoiceReadiness {
  return {
    missionId: 'mission-1',
    missionLabel: 'Transformation IT Europe',
    accountId: 'account-1',
    accountName: 'Airbus',
    periodMonth: '2026-07-01',
    state: 'blocked',
    blockers: ['missing_timesheet'],
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
    ...over,
  }
}

describe('deriveCraStatus — « sans objet » ≠ « à faire » ≠ « non mesuré »', () => {
  it('rend « non mesuré » quand aucun relevé n’est sous la main', () => {
    expect(deriveCraStatus([])).toBe('unknown')
  })

  it('rend « sans objet » quand TOUS les relevés sont « sans relevé attendu »', () => {
    expect(deriveCraStatus([timesheetLine({ status: 'not_required' })])).toBe('not_applicable')
  })

  it('rend « à faire » dès qu’un relevé manque, même si un autre est validé', () => {
    const lines = [timesheetLine({ status: 'validated' }), timesheetLine({ status: 'missing', consultantId: 'c2' })]
    expect(deriveCraStatus(lines)).toBe('action_needed')
  })

  it('rend « à faire » sur un relevé rejeté', () => {
    expect(deriveCraStatus([timesheetLine({ status: 'rejected' })])).toBe('action_needed')
  })

  it('rend « à valider » sur un relevé soumis, non encore validé', () => {
    expect(deriveCraStatus([timesheetLine({ status: 'submitted' })])).toBe('pending_validation')
  })

  it('rend « validé » quand au moins un relevé l’est et qu’aucun n’appelle un geste', () => {
    expect(deriveCraStatus([timesheetLine({ status: 'validated' })])).toBe('validated')
  })
})

describe('deriveInvoicingStatus', () => {
  it('rend « non mesuré » sans ligne de readiness', () => {
    expect(deriveInvoicingStatus(undefined)).toBe('unknown')
  })

  it('rend l’état SERVEUR tel quel, sans le retraiter', () => {
    expect(deriveInvoicingStatus(readiness({ state: 'ready' }))).toBe('ready')
    expect(deriveInvoicingStatus(readiness({ state: 'not_due' }))).toBe('not_due')
  })
})

describe('derivePaymentStatus — distinct de « à venir »', () => {
  it('rend « non mesuré » sans ligne de readiness', () => {
    expect(derivePaymentStatus(undefined, NOW)).toBe('unknown')
  })

  it('rend « sans objet » sur un mois non dû (jalon, forfait)', () => {
    expect(derivePaymentStatus(readiness({ state: 'not_due' }), NOW)).toBe('not_applicable')
  })

  /**
   * #1382 — « éviter "non mesuré" sans explication ».
   *
   * La réponse n'est pas d'ajouter une phrase à côté d'un état faux : un mois
   * `blocked` ou `ready` n'est pas « non mesuré », il est « pas encore
   * facturé », et on en connaît parfaitement la cause. C'était la cause racine
   * « cassé et non mesurable se ressemblent », prise à l'envers.
   */
  it('nomme « pas encore facturé », jamais « non mesuré », tant que rien n’est parti', () => {
    expect(derivePaymentStatus(readiness({ state: 'blocked' }), NOW)).toBe('not_invoiced')
    expect(derivePaymentStatus(readiness({ state: 'ready' }), NOW)).toBe('not_invoiced')
  })

  it('sait dire NON : « pas encore facturé » n’est ni « à venir » ni « sans objet »', () => {
    // Les trois appellent trois gestes différents — émettre la facture,
    // attendre l'échéance, ne rien faire du tout.
    expect(derivePaymentStatus(readiness({ state: 'blocked' }), NOW)).not.toBe('pending')
    expect(derivePaymentStatus(readiness({ state: 'blocked' }), NOW)).not.toBe('not_applicable')
  })

  it('réutilise collectionStatus une fois facturé — jamais un second calcul de retard', () => {
    const invoiced = readiness({ state: 'invoiced', blockers: [], dueOn: '2026-07-01', paidAt: null })
    expect(derivePaymentStatus(invoiced, NOW)).toBe('overdue')
    expect(derivePaymentStatus({ ...invoiced, paidAt: '2026-07-10T00:00:00.000Z' }, NOW)).toBe('paid')
  })

  /**
   * #2197.41 — un mois DÉCLARÉ facturé attend toujours son encaissement.
   *
   * C'est le test qui échoue si cet agrégat retombe sur `row.state === 'invoiced'`
   * strict : un mois `invoiced_declared` tomberait alors dans `not_invoiced`,
   * disparaissant du suivi d'encaissement — une déclaration humaine sans
   * preuve de connecteur n'en attend pas moins son règlement.
   */
  it('#2197.41 — un mois DÉCLARÉ facturé suit le MÊME calcul de retard qu’un PROUVÉ', () => {
    const declared = readiness({ state: 'invoiced_declared', blockers: [], dueOn: '2026-07-01', paidAt: null })
    expect(derivePaymentStatus(declared, NOW)).toBe('overdue')
    expect(derivePaymentStatus({ ...declared, paidAt: '2026-07-10T00:00:00.000Z' }, NOW)).toBe('paid')
  })
})

describe('deriveNextAction — LE LIEN', () => {
  it('rend null sans ligne de readiness', () => {
    expect(deriveNextAction(undefined, NOW)).toBeNull()
  })

  /**
   * #1383 — la ligne DÉSIGNE le bloqueur, elle ne recopie plus sa réparation.
   *
   * `actionKey` et `route` étaient dupliqués de `BLOCKER_ACTIONS` et servaient
   * à réassembler le libellé et le lien dans la cellule. La correspondance vit
   * à un seul endroit (GA-26) : `nextActionLink` la lit, et l'écran ne
   * l'invente plus.
   */
  it('pointe vers le PREMIER bloqueur de facturation, sans recopier sa réparation', () => {
    const row = readiness({ state: 'blocked', blockers: ['missing_timesheet', 'missing_rate'] })
    expect(deriveNextAction(row, NOW)).toEqual({ kind: 'blocker', blocker: 'missing_timesheet' })
  })

  it('rend null sur un mois prêt ou non dû — rien à faire, jamais un lien mort', () => {
    expect(deriveNextAction(readiness({ state: 'ready', blockers: [] }), NOW)).toBeNull()
    expect(deriveNextAction(readiness({ state: 'not_due', blockers: [] }), NOW)).toBeNull()
  })

  it('pointe vers la relance due sur un mois facturé en retard', () => {
    const row = readiness({ state: 'invoiced', blockers: [], dueOn: '2026-07-01', paidAt: null, remindersSent: 0 })
    expect(deriveNextAction(row, NOW)).toEqual({ kind: 'reminder', index: 1 })
  })

  // #2197.41 — même relance sur un mois DÉCLARÉ facturé : une déclaration
  // sans preuve de connecteur n'est pas exemptée de relance pour autant.
  it('#2197.41 — pointe AUSSI vers la relance due sur un mois DÉCLARÉ facturé en retard', () => {
    const row = readiness({
      state: 'invoiced_declared',
      blockers: [],
      dueOn: '2026-07-01',
      paidAt: null,
      remindersSent: 0,
    })
    expect(deriveNextAction(row, NOW)).toEqual({ kind: 'reminder', index: 1 })
  })

  it('rend null sur un mois facturé et réglé — « Aucune »', () => {
    const row = readiness({
      state: 'invoiced',
      blockers: [],
      dueOn: '2026-07-01',
      paidAt: '2026-07-10T00:00:00.000Z',
    })
    expect(deriveNextAction(row, NOW)).toBeNull()
  })
})

describe('buildMissionTrackingRows — le JOIN par mission', () => {
  it('compose les trois colonnes sans recalculer ce qu’un module tiers a déjà décidé', () => {
    const missions = [{ id: 'mission-1' }, { id: 'mission-2' }]
    const lines = [timesheetLine({ missionId: 'mission-1', status: 'validated' })]
    const readinessRows = [readiness({ missionId: 'mission-1', state: 'ready', blockers: [] })]

    const rows = buildMissionTrackingRows(missions, lines, readinessRows, NOW)

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ cra: 'validated', invoicing: 'ready', nextAction: null })
    // La seconde mission n'a ni relevé ni readiness sous la main : « non
    // mesuré » sur les trois colonnes, jamais « à faire ».
    expect(rows[1]).toMatchObject({ cra: 'unknown', invoicing: 'unknown', payment: 'unknown', nextAction: null })
  })
})

// ─────────────────────────────────────────────────────────────────────────
// LA FILE À TRAITER — #1378, #1379, #1380
// ─────────────────────────────────────────────────────────────────────────

function row(over: Partial<MissionTrackingRow<{ id: string; label: string }>> = {}) {
  const base: MissionTrackingRow<{ id: string; label: string }> = {
    mission: { id: 'mission-1', label: 'Transformation IT Europe' },
    cra: 'validated',
    invoicing: 'invoiced',
    payment: 'paid',
    nextAction: null,
    readiness: undefined,
  }
  return { ...base, ...over }
}

describe('trackingConcerns — ce qui met une mission dans la file (#1378)', () => {
  it('une mission entièrement saine n’a AUCUN motif, donc ne noie pas la file', () => {
    expect(trackingConcerns(row())).toEqual([])
    expect(isToAct(row())).toBe(false)
  })

  it('« sans objet » et « non mesuré » ne sont PAS des motifs', () => {
    // C'est le cœur de `derive.ts` : un forfait sans CRA n'a rien à traiter, et
    // un mois qu'on n'a pas lu n'est pas un mois en retard. Les faire entrer
    // dans la file remplirait « À traiter » de lignes sans geste possible.
    expect(trackingConcerns(row({ cra: 'not_applicable', invoicing: 'not_due', payment: 'not_applicable' }))).toEqual(
      [],
    )
    expect(trackingConcerns(row({ cra: 'unknown', invoicing: 'unknown', payment: 'unknown' }))).toEqual([])
  })

  it('« pas encore facturé » n’est pas un motif — c’est un FAIT, et la facture est le geste', () => {
    // #1382 : `not_invoiced` dit que la facture n'est pas partie. Le geste est
    // dans la colonne Facturation, il ne se compte pas deux fois.
    expect(trackingConcerns(row({ payment: 'not_invoiced' }))).toEqual([])
  })

  it('nomme chacun des motifs que le retour énumère', () => {
    expect(trackingConcerns(row({ payment: 'overdue' }))).toEqual(['payment_overdue'])
    expect(trackingConcerns(row({ payment: 'disputed' }))).toEqual(['payment_disputed'])
    expect(trackingConcerns(row({ invoicing: 'blocked' }))).toEqual(['invoicing_blocked'])
    expect(trackingConcerns(row({ invoicing: 'ready' }))).toEqual(['invoicing_ready'])
    expect(trackingConcerns(row({ cra: 'action_needed' }))).toEqual(['cra_action'])
    expect(trackingConcerns(row({ cra: 'pending_validation' }))).toEqual(['cra_pending'])
  })

  it('une action Action OS ouverte suffit, même quand les trois colonnes sont calmes', () => {
    const open = row({ nextAction: { kind: 'collection', actionKey: 'set_due_date' } })
    expect(trackingConcerns(open)).toEqual(['next_action'])
    expect(isToAct(open)).toBe(true)
  })

  it('ne compte PAS deux fois : une action déjà expliquée par une colonne ne rajoute pas de motif', () => {
    const blocked = row({ invoicing: 'blocked', nextAction: { kind: 'blocker', blocker: 'missing_timesheet' } })
    expect(trackingConcerns(blocked)).toEqual(['invoicing_blocked'])
  })

  it('rend les motifs dans l’ordre de l’urgence RÉELLE — le cash en retard d’abord', () => {
    const everything = row({ cra: 'action_needed', invoicing: 'blocked', payment: 'overdue' })
    expect(trackingConcerns(everything)).toEqual(['payment_overdue', 'invoicing_blocked', 'cra_action'])
  })
})

describe('sortByUrgency — « trier À traiter par urgence réelle » (#1378)', () => {
  it('remonte le motif le plus grave, et départage à égalité par le nom', () => {
    const ready = row({ mission: { id: 'b', label: 'Beta' }, invoicing: 'ready' })
    const overdue = row({ mission: { id: 'c', label: 'Gamma' }, payment: 'overdue' })
    const readyToo = row({ mission: { id: 'a', label: 'Alpha' }, invoicing: 'ready' })
    expect(sortByUrgency([ready, overdue, readyToo]).map(r => r.mission.id)).toEqual(['c', 'a', 'b'])
  })

  it('laisse les lignes saines APRÈS celles qui portent un motif, sans les jeter', () => {
    // « Tout le suivi » les montre : trier n'est pas filtrer.
    const healthy = row({ mission: { id: 'healthy', label: 'Alpha' } })
    const acted = row({ mission: { id: 'acted', label: 'Zeta' }, cra: 'pending_validation' })
    expect(sortByUrgency([healthy, acted]).map(r => r.mission.id)).toEqual(['acted', 'healthy'])
  })

  it('ne modifie pas le tableau qu’on lui donne', () => {
    const input = [
      row({ mission: { id: 'b', label: 'Beta' } }),
      row({ mission: { id: 'a', label: 'Alpha' }, payment: 'overdue' }),
    ]
    sortByUrgency(input)
    expect(input.map(r => r.mission.id)).toEqual(['b', 'a'])
  })
})

describe('automationGaps — l’automatisation qui aurait dû se déclencher (#1380)', () => {
  it('ne dit RIEN quand la routine est active : il n’y a pas de garde-fou manquant', () => {
    const rows = [row({ cra: 'action_needed' })]
    expect(automationGaps(rows, new Map([['timesheet_chase', true]]))).toEqual([])
  })

  it('ne dit rien non plus quand la routine est inactive mais qu’aucun problème ne le montre', () => {
    expect(automationGaps([row()], new Map([['timesheet_chase', false]]))).toEqual([])
  })

  it('nomme la routine inactive ET compte les lignes qu’elle aurait couvertes', () => {
    const rows = [row({ cra: 'action_needed' }), row({ mission: { id: 'm2', label: 'B' }, cra: 'action_needed' })]
    expect(automationGaps(rows, new Map([['timesheet_chase', false]]))).toEqual([
      { routine: 'timesheet_chase', count: 2 },
    ])
  })

  it('couvre aussi la facturation bloquée, et rend les manques dans l’ordre de l’urgence', () => {
    const rows = [row({ cra: 'action_needed', invoicing: 'blocked' })]
    const state = new Map([
      ['timesheet_chase', false],
      ['invoice_readiness', false],
    ] as const)
    expect(automationGaps(rows, state)).toEqual([
      { routine: 'invoice_readiness', count: 1 },
      { routine: 'timesheet_chase', count: 1 },
    ])
  })

  it('une routine dont on ignore l’état ne produit AUCUN manque — un silence n’est pas un « inactif »', () => {
    // Cause racine du dépôt : un verdict ne se conclut pas d'un silence.
    expect(automationGaps([row({ cra: 'action_needed' })], new Map())).toEqual([])
  })
})
