import type { ProjectRow } from '@bellum/contracts'
import { toCsv } from '@/lib/csv'
import type { ProjectColumnKey } from '../model/project-columns'
import { daysSince } from '../model/stale-alert'

/**
 * #4295.14 (#4016.11) — L'EXPORT DE LA LISTE FILTRÉE DES AFFAIRES, fabriqué dans le navigateur à partir des lignes déjà
 * chargées (le Kanban et le Tableau montrent la MÊME liste, `visibleProjects`). Ce fichier est le seul à fabriquer ce CSV
 * (GA-26) ; il sort par `downloadCSV`, donc par la règle d'espace (`PipelineMoreMenu` lit `useDataExit()`).
 *
 * Les colonnes : l'affaire, le compte, l'étape et les dates sont TOUJOURS là ; le reste suit les colonnes affichées du
 * tableau (le menu « Colonnes »). Une valeur absente est une cellule VIDE — jamais « 0 », jamais un texte de remplissage.
 */
export type ProjectsExportColumn =
  | 'project'
  | 'account'
  | 'stage'
  | 'origin'
  | 'owner'
  | 'amount'
  | 'nextAction'
  | 'nextActionDueOn'
  | 'stageEnteredOn'
  | 'lastActivityOn'
  | 'expectedCloseOn'
  | 'ageDays'

/** Les colonnes de l'export, dans l'ordre canonique, pour un choix de colonnes affichées. */
export function projectsExportColumns(visible: readonly ProjectColumnKey[]): ProjectsExportColumn[] {
  const shown = (key: ProjectColumnKey) => visible.includes(key)
  return [
    'project',
    'account',
    'stage',
    ...(shown('origin') ? (['origin'] as const) : []),
    ...(shown('owner') ? (['owner'] as const) : []),
    ...(shown('amount') ? (['amount'] as const) : []),
    ...(shown('nextAction') ? (['nextAction', 'nextActionDueOn'] as const) : []),
    'stageEnteredOn',
    'lastActivityOn',
    'expectedCloseOn',
    ...(shown('age') ? (['ageDays'] as const) : []),
  ]
}

type ProjectsExportContext = {
  /** L'en-tête de colonne, dans la langue de l'interface. */
  header: (column: ProjectsExportColumn) => string
  stageLabel: (stage: ProjectRow['stage']) => string
  originOf: (project: ProjectRow) => string | null
  ownerName: (ownerId: string | null) => string | null
  now?: Date
}

/** `2026-10-01T08:00:00.000Z` → `2026-10-01` : la date écrite par l'API, sans relecture au fuseau du navigateur. */
const day = (iso: string | null | undefined): string => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : '')

export function buildProjectsCsv(
  projects: readonly ProjectRow[],
  visible: readonly ProjectColumnKey[],
  context: ProjectsExportContext,
): string {
  const columns = projectsExportColumns(visible)
  const now = (context.now ?? new Date()).getTime()
  const cell = (project: ProjectRow, column: ProjectsExportColumn): string => {
    switch (column) {
      case 'project':
        return project.label
      case 'account':
        return project.company_name ?? ''
      case 'stage':
        return context.stageLabel(project.stage)
      case 'origin':
        return context.originOf(project) ?? ''
      case 'owner':
        return project.owner_name ?? context.ownerName(project.owner_id) ?? ''
      case 'amount':
        return typeof project.amount_cents === 'number' ? String(project.amount_cents / 100) : ''
      case 'nextAction':
        return project.next_action?.title ?? ''
      case 'nextActionDueOn':
        return day(project.next_action?.due_on)
      case 'stageEnteredOn':
        return day(project.stage_entered_at)
      case 'lastActivityOn':
        return day(project.updated_at)
      case 'expectedCloseOn':
        return day(project.expected_close_on)
      case 'ageDays': {
        const days = daysSince(project.stage_entered_at, now)
        return days === null ? '' : String(days)
      }
    }
  }
  return toCsv([columns.map(context.header), ...projects.map(project => columns.map(column => cell(project, column)))])
}
