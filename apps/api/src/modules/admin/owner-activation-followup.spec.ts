import { dueFollowUp, OWNER_ACTIVATION_REMINDER_SCHEDULE_DAYS } from './owner-activation-followup'

describe('dueFollowUp (#2643.3)', () => {
  it('la cadence est J+2 puis J+5, jamais devinée ailleurs', () => {
    expect(OWNER_ACTIVATION_REMINDER_SCHEDULE_DAYS).toEqual([2, 5])
  })

  it('refuse AVANT J+2 — la première relance n’est pas encore due', () => {
    const result = dueFollowUp({ firstSentOn: '2026-09-19', remindersSent: 0, today: '2026-09-20' })
    expect(result).toEqual({ due: false, reason: 'not_due_yet', nextDueOn: '2026-09-21' })
  })

  it('accepte à J+2 pile — la première relance (rang 1)', () => {
    const result = dueFollowUp({ firstSentOn: '2026-09-18', remindersSent: 0, today: '2026-09-20' })
    expect(result).toEqual({ due: true, index: 1 })
  })

  it('une relance déjà consignée : la seconde attend J+5, pas J+2+J+2', () => {
    const tropTot = dueFollowUp({ firstSentOn: '2026-09-18', remindersSent: 1, today: '2026-09-21' })
    expect(tropTot).toEqual({ due: false, reason: 'not_due_yet', nextDueOn: '2026-09-23' })

    const due = dueFollowUp({ firstSentOn: '2026-09-18', remindersSent: 1, today: '2026-09-23' })
    expect(due).toEqual({ due: true, index: 2 })
  })

  it('refuse après DEUX relances — la cadence est épuisée, pas un troisième rang deviné', () => {
    const result = dueFollowUp({ firstSentOn: '2026-09-01', remindersSent: 2, today: '2026-09-30' })
    expect(result).toEqual({ due: false, reason: 'cadence_exhausted', nextDueOn: null })
  })
})
