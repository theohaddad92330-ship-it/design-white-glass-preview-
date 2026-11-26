import { describe, expect, it } from 'vitest'
import type { TimesheetLine } from './api'
import {
  filterTimesheetLinesByState,
  summarizeTimesheetStates,
  timesheetLinesToCsv,
  timesheetStateOf,
} from './timesheet-states'

function line(over: Partial<TimesheetLine> = {}): TimesheetLine {
  return {
    timesheetId: 't1',
    missionId: 'm1',
    missionLabel: 'Plateforme conteneurs',
    accountName: 'Société Générale',
    consultantId: 'c1',
    consultantName: 'Camille Roussel',
    periodMonth: '2026-09',
    status: 'submitted',
    days: 20,
    expectedDays: 20,
    gap: 0,
    gapKind: 'none',
    gapExplanation: null,
    blocksInvoicing: false,
    validatedByClientAt: null,
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

describe('timesheetStateOf — les cinq états de Théo, dérivés du statut', () => {
  it('un relevé attendu, manquant, brouillon ou escaladé reste « à recevoir »', () => {
    for (const status of ['expected', 'missing', 'draft', 'escalated'] as const) {
      expect(timesheetStateOf(line({ status }))).toBe('toReceive')
    }
  })

  it('un relevé reçu non relu en interne est « à contrôler », relu il attend le client', () => {
    expect(timesheetStateOf(line())).toBe('toCheck')
    expect(timesheetStateOf(line({ internalReviewedAt: '2026-10-01T00:00:00Z' }))).toBe('clientWait')
  })

  it('validé et rejeté ont leur état ; contesté et sans relevé n’en ont aucun', () => {
    expect(timesheetStateOf(line({ status: 'validated' }))).toBe('clientValidated')
    expect(timesheetStateOf(line({ status: 'rejected' }))).toBe('rejected')
    expect(timesheetStateOf(line({ status: 'disputed' }))).toBeNull()
    expect(timesheetStateOf(line({ status: 'not_required' }))).toBeNull()
  })

  it('une exception « non applicable » sort de « à recevoir » — on n’attend plus rien', () => {
    const exception = { reason: 'Congé sans solde' } as unknown as TimesheetLine['notApplicable']
    expect(timesheetStateOf(line({ status: 'missing', notApplicable: exception }))).toBeNull()
  })
})

describe('summarizeTimesheetStates', () => {
  it('compte chaque état et additionne les jours déclarés des relevés validés', () => {
    const summary = summarizeTimesheetStates([
      line({ status: 'missing', days: null }),
      line(),
      line({ internalReviewedAt: '2026-10-01T00:00:00Z' }),
      line({ status: 'validated', days: 18 }),
      line({ status: 'validated', days: 20 }),
    ])
    expect(summary.counts).toEqual({ toReceive: 1, toCheck: 1, clientWait: 1, clientValidated: 2, rejected: 0 })
    expect(summary.validatedDays).toBe(38)
    expect(summary.notApplicable).toBe(0)
  })

  it('aucun relevé validé ne donne pas « 0 jour » mais une valeur absente', () => {
    expect(summarizeTimesheetStates([line()]).validatedDays).toBeNull()
  })

  it('un validé sans jour déclaré ne compte pas pour zéro jour', () => {
    expect(summarizeTimesheetStates([line({ status: 'validated', days: null })]).validatedDays).toBeNull()
  })

  it('compte les exceptions « non applicable »', () => {
    const exception = { reason: 'x' } as unknown as TimesheetLine['notApplicable']
    expect(summarizeTimesheetStates([line({ status: 'missing', notApplicable: exception })]).notApplicable).toBe(1)
  })
})

describe('filterTimesheetLinesByState', () => {
  const lines = [line({ status: 'missing' }), line(), line({ status: 'validated' })]
  it('« all » garde tout, un état ne garde que lui', () => {
    expect(filterTimesheetLinesByState(lines, 'all')).toHaveLength(3)
    expect(filterTimesheetLinesByState(lines, 'toCheck')).toHaveLength(1)
    expect(filterTimesheetLinesByState(lines, 'rejected')).toHaveLength(0)
  })
})

describe('timesheetLinesToCsv', () => {
  it('écrit une ligne d’en-tête puis une ligne par relevé, « — » quand le jour est inconnu', () => {
    const csv = timesheetLinesToCsv(
      [line({ days: null, consultantName: 'Camille; "CR"' })],
      ['Consultant', 'Mission', 'Compte', 'Période', 'Statut', 'Jours déclarés'],
      status => `s:${status}`,
    )
    const [head, row] = csv.split('\n')
    expect(head).toBe('Consultant;Mission;Compte;Période;Statut;Jours déclarés')
    expect(row).toBe('"Camille; ""CR""";Plateforme conteneurs;Société Générale;2026-09;s:submitted;—')
  })
})
