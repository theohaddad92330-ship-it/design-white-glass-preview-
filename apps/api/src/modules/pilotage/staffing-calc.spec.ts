import {
  buildBench,
  buildCapacity,
  buildEndings,
  buildTacePeriod,
  frenchHolidays,
  workingDaysIn,
  type CalcAbsence,
  type CalcAssignment,
  type CalcConsultant,
} from './staffing-calc'

const consultant = (id: string, over: Partial<CalcConsultant> = {}): CalcConsultant => ({
  id,
  fullName: `Consultant ${id}`,
  skills: [],
  dailyCostCents: null,
  ...over,
})

describe('frenchHolidays', () => {
  it('knows fixed days and the Easter-based ones for 2026', () => {
    const days = frenchHolidays(2026)
    expect(days).toEqual(
      expect.arrayContaining([
        '2026-01-01',
        '2026-04-06', // lundi de Pâques (Pâques = 5 avril 2026)
        '2026-05-01',
        '2026-05-08',
        '2026-05-14', // Ascension
        '2026-05-25', // lundi de Pentecôte
        '2026-07-14',
        '2026-08-15',
        '2026-11-01',
        '2026-11-11',
        '2026-12-25',
      ]),
    )
    expect(days).toHaveLength(11)
  })
})

describe('workingDaysIn', () => {
  it('excludes weekends and French public holidays', () => {
    // semaine du 4 mai 2026 : lundi 4 → vendredi 8 (8 mai férié)
    expect(workingDaysIn('2026-05-04', '2026-05-10')).toEqual(['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07'])
  })
})

describe('buildCapacity', () => {
  const today = '2026-10-14' // mercredi
  const base = { today, weeks: 12, needs: [], assignments: [], absences: [] as CalcAbsence[] }

  it('returns 12 Monday-anchored weeks starting with the current one', () => {
    const cap = buildCapacity({ ...base, consultants: [consultant('a')] })
    expect(cap.weeks).toHaveLength(12)
    expect(cap.weeks[0].weekStart).toBe('2026-10-12')
    expect(cap.weeks[1].weekStart).toBe('2026-10-19')
    expect(cap.weeks[0].capacityDays).toBe(5)
  })

  it('removes absence days from capacity, once per consultant-day', () => {
    const absences: CalcAbsence[] = [
      { consultantId: 'a', startsOn: '2026-10-19', endsOn: '2026-10-21' },
      { consultantId: 'a', startsOn: '2026-10-20', endsOn: '2026-10-20' }, // chevauche
    ]
    const cap = buildCapacity({ ...base, consultants: [consultant('a'), consultant('b')], absences })
    expect(cap.weeks[1].capacityDays).toBe(10 - 3)
  })

  it('counts signed-mission days by load, and keeps open needs separate', () => {
    const assignments: CalcAssignment[] = [
      { consultantId: 'a', loadPercent: 50, startsOn: '2026-01-01', endsOn: null },
      { consultantId: 'b', loadPercent: 100, startsOn: '2026-10-19', endsOn: '2026-10-23' },
    ]
    const cap = buildCapacity({
      ...base,
      consultants: [consultant('a'), consultant('b')],
      assignments,
      needs: [{ headcount: 2, startOn: '2026-10-26', durationMonths: 1 }],
    })
    expect(cap.weeks[0].signedMissionDays).toBe(2.5)
    expect(cap.weeks[1].signedMissionDays).toBe(2.5 + 5)
    expect(cap.weeks[1].openNeedDays).toBe(0)
    expect(cap.weeks[2].openNeedDays).toBe(10)
    expect(cap.weeks[2].signedMissionDays).toBe(2.5)
  })

  it('names undated open needs instead of counting them', () => {
    const cap = buildCapacity({
      ...base,
      consultants: [],
      needs: [{ headcount: 1, startOn: null, durationMonths: 3 }],
    })
    expect(cap.undatedOpenNeeds).toBe(1)
    expect(cap.weeks.every(w => w.openNeedDays === 0)).toBe(true)
  })
})

describe('buildBench', () => {
  const today = '2026-10-14'
  const assignments: CalcAssignment[] = [
    { consultantId: 'busy', loadPercent: 100, startsOn: '2026-06-01', endsOn: null },
    { consultantId: 'free', loadPercent: 100, startsOn: '2026-01-01', endsOn: '2026-10-02' },
  ]

  it('lists consultants with no assignment today, with days since and cost', () => {
    const bench = buildBench({
      today,
      canReadCost: true,
      consultants: [consultant('busy'), consultant('free', { dailyCostCents: 40_000 }), consultant('never')],
      assignments,
      absences: [],
    })
    const ids = bench.consultants.map(c => c.consultantId)
    expect(ids).toEqual(expect.arrayContaining(['free', 'never']))
    expect(ids).not.toContain('busy')
    const free = bench.consultants.find(c => c.consultantId === 'free')
    expect(free?.freeSince).toBe('2026-10-03')
    // 5, 6, 7, 8, 9, 12, 13, 14 octobre, lundi 5 → 8 jours? du 3 (samedi) au 14
    expect(free?.benchDaysThisMonth).toBe(8)
    expect(free?.cost).toEqual({ state: 'known', dailyCostCents: 40_000, monthCostCents: 8 * 40_000 })
    const never = bench.consultants.find(c => c.consultantId === 'never')
    expect(never?.freeSince).toBeNull()
    expect(never?.cost).toEqual({ state: 'unknown' })
    expect(bench.knownCostCents).toBe(8 * 40_000)
    expect(bench.withoutCost).toBe(1)
  })

  it('dates the bench from a finished mission that is no longer an active assignment', () => {
    const bench = buildBench({
      today,
      canReadCost: true,
      consultants: [consultant('gone')],
      assignments: [],
      absences: [],
      lastEnds: new Map([['gone', '2026-08-01']]),
    })
    expect(bench.consultants[0].freeSince).toBe('2026-08-02')
  })

  it('never states a cost for a caller without finance rights', () => {
    const bench = buildBench({
      today,
      canReadCost: false,
      consultants: [consultant('free', { dailyCostCents: 40_000 })],
      assignments,
      absences: [],
    })
    expect(bench.consultants[0].cost).toEqual({ state: 'restricted' })
    expect(bench.knownCostCents).toBeNull()
  })

  it('does not count absence days as bench days', () => {
    const bench = buildBench({
      today,
      canReadCost: true,
      consultants: [consultant('free')],
      assignments,
      absences: [{ consultantId: 'free', startsOn: '2026-10-05', endsOn: '2026-10-09' }],
    })
    expect(bench.consultants[0].benchDaysThisMonth).toBe(3)
  })

  it('knownCostCents is null when no cost is known', () => {
    const bench = buildBench({
      today,
      canReadCost: true,
      consultants: [consultant('x')],
      assignments: [],
      absences: [],
    })
    expect(bench.knownCostCents).toBeNull()
  })
})

describe('buildEndings', () => {
  const today = '2026-10-14'
  const row = (id: string, endsOn: string, status = 'active') => ({
    missionId: id,
    consultantName: 'Camille Durand',
    accountName: 'Orange',
    endsOn,
    status,
  })

  it('sorts missions into disjoint 30 / 60 / 90 day columns', () => {
    const e = buildEndings(today, [
      row('m30', '2026-11-13'),
      row('m31', '2026-11-14'),
      row('m60', '2026-12-13'),
      row('m90', '2027-01-12'),
      row('m91', '2027-01-13'),
      row('past', '2026-10-13'),
    ])
    expect(e.within30.map(m => m.missionId)).toEqual(['m30'])
    expect(e.within60.map(m => m.missionId)).toEqual(['m31', 'm60'])
    expect(e.within90.map(m => m.missionId)).toEqual(['m90'])
  })

  it('reads renewal from the mission status only', () => {
    const e = buildEndings(today, [
      row('a', '2026-10-20', 'renewed'),
      row('b', '2026-10-21', 'renewal_pending'),
      row('c', '2026-10-22', 'active'),
    ])
    expect(e.within30.map(m => m.renewal)).toEqual(['known', 'in_discussion', 'unknown'])
  })
})

describe('buildTacePeriod', () => {
  const consultants = [consultant('a'), consultant('b')]
  const assignments: CalcAssignment[] = [{ consultantId: 'a', loadPercent: 100, startsOn: '2026-01-01', endsOn: null }]

  it('divides billed days by available working days, holidays and leave excluded', () => {
    // septembre 2026 : 22 jours ouvrés, aucun férié ; a prend 2 jours de congé → 20 disponibles
    const period = buildTacePeriod({
      month: '2026-09',
      today: '2026-10-14',
      consultants,
      assignments,
      absences: [{ consultantId: 'a', startsOn: '2026-09-07', endsOn: '2026-09-08' }],
      billedDays: new Map([['a', 16]]),
    })
    const a = period.consultants.find(c => c.consultantId === 'a')
    expect(a?.actual).toEqual({ percent: 80, days: 16, availableDays: 20 })
    expect(a?.planned).toEqual({ percent: 100, days: 20, availableDays: 20 })
    expect(period.from).toBe('2026-09-01')
    expect(period.to).toBe('2026-09-30')
  })

  it('has no actual TACE — null, never 0 — when no time was entered', () => {
    const period = buildTacePeriod({
      month: '2026-09',
      today: '2026-10-14',
      consultants,
      assignments,
      absences: [],
      billedDays: new Map(),
    })
    const a = period.consultants.find(c => c.consultantId === 'a')
    expect(a?.actual.percent).toBeNull()
    expect(a?.actual.days).toBeNull()
    expect(period.global.actual.percent).toBeNull()
  })

  it('computes the global actual over measured consultants only', () => {
    const period = buildTacePeriod({
      month: '2026-09',
      today: '2026-10-14',
      consultants,
      assignments: [],
      absences: [],
      billedDays: new Map([['a', 11]]),
    })
    expect(period.global.actual).toEqual({ percent: 50, days: 11, availableDays: 22 })
  })

  it('stops the current month at today', () => {
    const period = buildTacePeriod({
      month: '2026-10',
      today: '2026-10-14',
      consultants: [consultant('a')],
      assignments,
      absences: [],
      billedDays: new Map(),
    })
    expect(period.to).toBe('2026-10-14')
    expect(period.global.planned.availableDays).toBe(10)
  })
})
