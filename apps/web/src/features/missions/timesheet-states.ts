import type { TimesheetLine } from './api'

// Théo C missions-cra.R2 — les cinq états du tableau plat, dérivés du statut du
// relevé et de sa relecture interne : aucun état nouveau n'est stocké.
type TimesheetState = 'toReceive' | 'toCheck' | 'clientWait' | 'clientValidated' | 'rejected'
export type TimesheetStateFilter = TimesheetState | 'all' | 'blocking'

const TO_RECEIVE: ReadonlySet<TimesheetLine['status']> = new Set(['expected', 'missing', 'draft', 'escalated'])

/** `null` : ni attendu ni à contrôler (contesté, sans relevé, exception « non applicable »). */
export function timesheetStateOf(line: TimesheetLine): TimesheetState | null {
  if (line.notApplicable) return null
  if (TO_RECEIVE.has(line.status)) return 'toReceive'
  if (line.status === 'submitted') return line.internalReviewedAt ? 'clientWait' : 'toCheck'
  if (line.status === 'validated') return 'clientValidated'
  if (line.status === 'rejected') return 'rejected'
  return null
}

export function summarizeTimesheetStates(lines: readonly TimesheetLine[]): {
  counts: Record<TimesheetState, number>
  /** `null` : aucun jour déclaré sur un relevé validé — jamais « 0 jour ». */
  validatedDays: number | null
  notApplicable: number
} {
  const counts: Record<TimesheetState, number> = {
    toReceive: 0,
    toCheck: 0,
    clientWait: 0,
    clientValidated: 0,
    rejected: 0,
  }
  let validatedDays: number | null = null
  let notApplicable = 0
  for (const line of lines) {
    if (line.notApplicable) notApplicable += 1
    const state = timesheetStateOf(line)
    if (state === null) continue
    counts[state] += 1
    if (state === 'clientValidated' && line.days !== null) {
      validatedDays = validatedDays === null ? line.days : validatedDays + line.days
    }
  }
  return { counts, validatedDays, notApplicable }
}

/** `'blocking'` ne se filtre pas ici : le serveur le porte (`blockingOnly`). */
export function filterTimesheetLinesByState(
  lines: readonly TimesheetLine[],
  filter: TimesheetStateFilter,
): TimesheetLine[] {
  if (filter === 'all' || filter === 'blocking') return [...lines]
  return lines.filter(line => timesheetStateOf(line) === filter)
}

function csvCell(value: string): string {
  return /[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** « Exporter la sélection » (N6) : ce qui est affiché, rien de plus. */
export function timesheetLinesToCsv(
  lines: readonly TimesheetLine[],
  header: readonly string[],
  statusLabel: (status: TimesheetLine['status']) => string,
): string {
  const rows = lines.map(line =>
    [
      line.consultantName ?? '—',
      line.missionLabel ?? '—',
      line.accountName ?? '—',
      line.periodMonth,
      statusLabel(line.status),
      line.days === null ? '—' : String(line.days),
    ]
      .map(csvCell)
      .join(';'),
  )
  return [header.map(csvCell).join(';'), ...rows].join('\n')
}
