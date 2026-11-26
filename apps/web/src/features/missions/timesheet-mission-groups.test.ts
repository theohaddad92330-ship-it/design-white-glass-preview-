import { describe, expect, it } from 'vitest'
import { groupTimesheetLinesByMission } from './timesheet-mission-groups'
import type { TimesheetLine } from './api'

/** Une ligne de relevé minimale — seuls les champs lus par le groupement comptent ici. */
function line(over: Partial<TimesheetLine> & Pick<TimesheetLine, 'missionId' | 'consultantId'>): TimesheetLine {
  return {
    timesheetId: 'ts-1',
    missionLabel: 'Run plateforme',
    accountName: 'ACME',
    consultantName: 'A. Dupont',
    periodMonth: '2026-07-01',
    status: 'validated',
    days: 21,
    expectedDays: 21,
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

/**
 * #2415.8 — « Agréger plusieurs CRA consultants sur une même facture ».
 *
 * Bellum ne crée ni n'émet de facture (doctrine) : ce que ce groupement rend
 * est la maille qui existe déjà, `TimesheetsService.month`, REGROUPÉE par
 * mission — la préparation de facturation mission, jamais un objet facture.
 */
describe('groupTimesheetLinesByMission (#2415.8)', () => {
  it('regroupe deux consultants de la MÊME mission sous un seul groupe', () => {
    const groups = groupTimesheetLinesByMission([
      line({ missionId: 'm-1', consultantId: 'c-1' }),
      line({ missionId: 'm-1', consultantId: 'c-2' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].missionId).toBe('m-1')
    expect(groups[0].lines).toHaveLength(2)
  })

  it('garde deux missions distinctes dans deux groupes distincts, dans leur ordre d’apparition', () => {
    const groups = groupTimesheetLinesByMission([
      line({ missionId: 'm-2', consultantId: 'c-1' }),
      line({ missionId: 'm-1', consultantId: 'c-2' }),
    ])
    expect(groups.map(g => g.missionId)).toEqual(['m-2', 'm-1'])
  })

  it('un groupe est PRÊT quand AUCUNE de ses lignes ne bloque la facturation', () => {
    const groups = groupTimesheetLinesByMission([
      line({ missionId: 'm-1', consultantId: 'c-1', blocksInvoicing: false }),
      line({ missionId: 'm-1', consultantId: 'c-2', blocksInvoicing: false }),
    ])
    expect(groups[0].readyToInvoice).toBe(true)
  })

  it('un groupe n’est PAS prêt dès qu’UNE seule de ses lignes bloque — jamais une moyenne', () => {
    const groups = groupTimesheetLinesByMission([
      line({ missionId: 'm-1', consultantId: 'c-1', blocksInvoicing: false }),
      line({ missionId: 'm-1', consultantId: 'c-2', blocksInvoicing: true }),
    ])
    expect(groups[0].readyToInvoice).toBe(false)
  })

  it('une liste vide rend une liste de groupes vide, jamais une erreur', () => {
    expect(groupTimesheetLinesByMission([])).toEqual([])
  })
})
