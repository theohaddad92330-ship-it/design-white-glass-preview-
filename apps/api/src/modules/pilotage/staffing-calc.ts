import type {
  BenchConsultant,
  EndingMission,
  MissionRenewal,
  StaffingBench,
  StaffingCapacity,
  StaffingEndings,
  TacePeriod,
  TaceValue,
} from '@bellum/contracts'

/**
 * Le calcul PUR de l'écran Staffing — aucune base, aucune horloge (la date du jour
 * est un paramètre), donc rejouable à l'identique dans un test.
 *
 * Trois règles tiennent tout le fichier :
 *  - un jour est OUVRÉ s'il n'est ni samedi, ni dimanche, ni férié français ;
 *  - un congé retire un jour de la capacité et du dénominateur du TACE, une seule
 *    fois par consultant et par jour, même si deux absences se chevauchent ;
 *  - une valeur non mesurée est `null`, jamais 0.
 */

export type CalcConsultant = {
  id: string
  fullName: string
  skills: string[]
  /** Coût journalier en centimes, `null` = non renseigné. */
  dailyCostCents: number | null
}
export type CalcAssignment = { consultantId: string; loadPercent: number; startsOn: string; endsOn: string | null }
export type CalcAbsence = { consultantId: string; startsOn: string; endsOn: string }
export type CalcNeed = { headcount: number; startOn: string | null; durationMonths: number | null }

const DAY_MS = 86_400_000

const toDate = (iso: string): Date => new Date(`${iso}T00:00:00Z`)
const toIso = (date: Date): string => date.toISOString().slice(0, 10)
const addDays = (iso: string, days: number): string => toIso(new Date(toDate(iso).getTime() + days * DAY_MS))
const round2 = (value: number): number => Math.round(value * 100) / 100

/** Les 11 jours fériés français (métropole), Pâques par l'algorithme de Meeus/Jones/Butcher. */
export function frenchHolidays(year: number): string[] {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  const easter = toIso(new Date(Date.UTC(year, month - 1, day)))
  const fixed = ['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25'].map(md => `${year}-${md}`)
  return [...fixed, addDays(easter, 1), addDays(easter, 39), addDays(easter, 50)].sort()
}

const holidayCache = new Map<number, ReadonlySet<string>>()
function isHoliday(iso: string): boolean {
  const year = Number(iso.slice(0, 4))
  let set = holidayCache.get(year)
  if (!set) {
    set = new Set(frenchHolidays(year))
    holidayCache.set(year, set)
  }
  return set.has(iso)
}

export function isWorkingDay(iso: string): boolean {
  const weekday = toDate(iso).getUTCDay()
  return weekday !== 0 && weekday !== 6 && !isHoliday(iso)
}

/** Les jours ouvrés de `from` à `to`, bornes incluses. */
export function workingDaysIn(from: string, to: string): string[] {
  const days: string[] = []
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
    if (isWorkingDay(cursor)) days.push(cursor)
  }
  return days
}

/** `consultantId` → ensemble des jours d'absence (tous les jours calendaires couverts). */
function absenceDays(absences: readonly CalcAbsence[], from: string, to: string): Map<string, Set<string>> {
  const byConsultant = new Map<string, Set<string>>()
  for (const absence of absences) {
    const start = absence.startsOn > from ? absence.startsOn : from
    const end = absence.endsOn < to ? absence.endsOn : to
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
      const set = byConsultant.get(absence.consultantId) ?? new Set<string>()
      set.add(cursor)
      byConsultant.set(absence.consultantId, set)
    }
  }
  return byConsultant
}

const covers = (assignment: CalcAssignment, day: string): boolean =>
  assignment.startsOn <= day && (assignment.endsOn === null || assignment.endsOn >= day)

const mondayOf = (iso: string): string => {
  const weekday = toDate(iso).getUTCDay() // 0 = dimanche
  return addDays(iso, -((weekday + 6) % 7))
}

const addMonths = (iso: string, months: number): string => {
  const date = toDate(iso)
  date.setUTCMonth(date.getUTCMonth() + months)
  return toIso(date)
}

export function buildCapacity(input: {
  today: string
  weeks: number
  consultants: readonly Pick<CalcConsultant, 'id'>[]
  assignments: readonly CalcAssignment[]
  absences: readonly CalcAbsence[]
  needs: readonly CalcNeed[]
}): StaffingCapacity {
  const first = mondayOf(input.today)
  const last = addDays(first, input.weeks * 7 - 1)
  const absent = absenceDays(input.absences, first, last)
  const ids = new Set(input.consultants.map(c => c.id))
  const dated = input.needs.filter(need => need.startOn !== null)

  const weeks = Array.from({ length: input.weeks }, (_, index) => {
    const weekStart = addDays(first, index * 7)
    const days = workingDaysIn(weekStart, addDays(weekStart, 6))
    let capacity = 0
    for (const id of ids) {
      capacity += days.filter(day => !absent.get(id)?.has(day)).length
    }
    let signed = 0
    for (const assignment of input.assignments) {
      for (const day of days) {
        if (covers(assignment, day)) signed += assignment.loadPercent / 100
      }
    }
    let needDays = 0
    for (const need of dated) {
      // Sans durée connue, le besoin court jusqu'à la fin de l'horizon : il est ouvert tant qu'il n'est pas pourvu.
      const end = need.durationMonths ? addDays(addMonths(need.startOn as string, need.durationMonths), -1) : last
      for (const day of days) {
        if (day >= (need.startOn as string) && day <= end) needDays += need.headcount
      }
    }
    return {
      weekStart,
      workingDays: days.length,
      consultants: ids.size,
      capacityDays: round2(capacity),
      signedMissionDays: round2(signed),
      openNeedDays: round2(needDays),
    }
  })

  return {
    generatedAt: `${input.today}T00:00:00.000Z`,
    from: first,
    to: last,
    weeks,
    undatedOpenNeeds: input.needs.length - dated.length,
  }
}

export function buildBench(input: {
  today: string
  canReadCost: boolean
  consultants: readonly CalcConsultant[]
  assignments: readonly CalcAssignment[]
  absences: readonly CalcAbsence[]
  /** Dernière fin d'affectation connue par consultant, missions terminées comprises. */
  lastEnds?: ReadonlyMap<string, string>
}): StaffingBench {
  const monthStart = `${input.today.slice(0, 7)}-01`
  const absent = absenceDays(input.absences, monthStart, input.today)
  const monthDays = workingDaysIn(monthStart, input.today)
  const consultants: BenchConsultant[] = []

  for (const consultant of input.consultants) {
    const own = input.assignments.filter(a => a.consultantId === consultant.id)
    if (own.some(a => covers(a, input.today))) continue
    const known = input.lastEnds?.get(consultant.id)
    const ended = [...own.map(a => a.endsOn), known ?? null].filter((d): d is string => d !== null && d < input.today)
    const lastEnd = ended.length ? ended.sort().at(-1) : undefined
    const benchDays = monthDays.filter(
      day => !absent.get(consultant.id)?.has(day) && !own.some(a => covers(a, day)),
    ).length
    let cost: BenchConsultant['cost'] = { state: 'restricted' }
    if (input.canReadCost) {
      cost =
        consultant.dailyCostCents === null
          ? { state: 'unknown' }
          : {
              state: 'known',
              dailyCostCents: consultant.dailyCostCents,
              monthCostCents: benchDays * consultant.dailyCostCents,
            }
    }
    consultants.push({
      consultantId: consultant.id,
      fullName: consultant.fullName,
      freeSince: lastEnd ? addDays(lastEnd, 1) : null,
      benchDaysThisMonth: benchDays,
      mainSkills: consultant.skills.slice(0, 3),
      cost,
    })
  }

  consultants.sort((a, b) => b.benchDaysThisMonth - a.benchDaysThisMonth || a.fullName.localeCompare(b.fullName, 'fr'))
  const known = consultants.flatMap(c => (c.cost.state === 'known' ? [c.cost.monthCostCents] : []))
  return {
    month: input.today.slice(0, 7),
    countedUntil: input.today,
    consultants,
    knownCostCents: known.length ? known.reduce((sum, v) => sum + v, 0) : null,
    withoutCost: consultants.filter(c => c.cost.state === 'unknown').length,
  }
}

const renewalOf = (status: string): MissionRenewal =>
  status === 'renewed' ? 'known' : status === 'renewal_pending' ? 'in_discussion' : 'unknown'

export function buildEndings(
  today: string,
  rows: readonly {
    missionId: string
    consultantName: string | null
    accountName: string | null
    endsOn: string
    status: string
  }[],
): StaffingEndings {
  const out: StaffingEndings = { within30: [], within60: [], within90: [] }
  const sorted = [...rows].sort((a, b) => a.endsOn.localeCompare(b.endsOn))
  for (const row of sorted) {
    const daysLeft = Math.round((toDate(row.endsOn).getTime() - toDate(today).getTime()) / DAY_MS)
    if (daysLeft < 0 || daysLeft > 90) continue
    const mission: EndingMission = {
      missionId: row.missionId,
      consultantName: row.consultantName,
      accountName: row.accountName,
      endsOn: row.endsOn,
      daysLeft,
      renewal: renewalOf(row.status),
    }
    if (daysLeft <= 30) out.within30.push(mission)
    else if (daysLeft <= 60) out.within60.push(mission)
    else out.within90.push(mission)
  }
  return out
}

function taceValue(days: number | null, availableDays: number): TaceValue {
  if (days === null || availableDays <= 0)
    return { percent: null, days: days === null ? null : round2(days), availableDays }
  return { percent: round2((days / availableDays) * 100), days: round2(days), availableDays }
}

/**
 * TACE d'un mois = jours ÷ jours ouvrés DISPONIBLES (week-ends, fériés et congés
 * exclus du dénominateur). Le mois en cours s'arrête à aujourd'hui.
 * `billedDays` : jours saisis par consultant ; un consultant absent de la Map n'a
 * rien de saisi → réel « non mesuré ».
 */
export function buildTacePeriod(input: {
  month: string
  today: string
  consultants: readonly Pick<CalcConsultant, 'id' | 'fullName'>[]
  assignments: readonly CalcAssignment[]
  absences: readonly CalcAbsence[]
  billedDays: ReadonlyMap<string, number>
}): TacePeriod {
  const from = `${input.month}-01`
  const monthEnd = addDays(addMonths(from, 1), -1)
  const to = input.today < monthEnd ? input.today : monthEnd
  const days = workingDaysIn(from, to)
  const absent = absenceDays(input.absences, from, to)

  const rows = input.consultants.map(consultant => {
    const available = days.filter(day => !absent.get(consultant.id)?.has(day))
    const own = input.assignments.filter(a => a.consultantId === consultant.id)
    let plannedDays = 0
    for (const day of available) {
      for (const assignment of own) if (covers(assignment, day)) plannedDays += assignment.loadPercent / 100
    }
    const billed = input.billedDays.get(consultant.id)
    return {
      consultantId: consultant.id,
      fullName: consultant.fullName,
      available: available.length,
      plannedDays,
      billed: billed === undefined ? null : billed,
    }
  })

  const withAvailability = rows.filter(r => r.available > 0)
  const measured = withAvailability.filter(r => r.billed !== null)
  const sum = (values: number[]) => values.reduce((total, v) => total + v, 0)

  return {
    month: input.month,
    from,
    to,
    global: {
      planned: taceValue(
        withAvailability.length ? sum(withAvailability.map(r => r.plannedDays)) : null,
        sum(withAvailability.map(r => r.available)),
      ),
      actual: taceValue(
        measured.length ? sum(measured.map(r => r.billed as number)) : null,
        sum(measured.map(r => r.available)),
      ),
    },
    consultants: withAvailability
      .filter(r => r.plannedDays > 0 || r.billed !== null)
      .map(r => ({
        consultantId: r.consultantId,
        fullName: r.fullName,
        planned: taceValue(r.plannedDays, r.available),
        actual: taceValue(r.billed, r.available),
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'fr')),
  }
}
