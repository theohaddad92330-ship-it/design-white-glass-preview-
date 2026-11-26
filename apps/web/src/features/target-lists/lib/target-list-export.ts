import {
  ACCOUNT_FACTS_EXPORT_COLUMNS,
  emptyAccountFactsExportCells,
  type AccountFactsExportCells,
  type AccountFactsExportColumn,
  type TargetList,
  type TargetListItem,
} from '@bellum/contracts'
import type { WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'
import { toCsv } from '@/lib/csv'

/* ------------------------------------------------------------------ */
/*  Export d'une cible (#2157.46) — colonne pour colonne, exactement    */
/*  ce que `TargetListCard`/`TargetListsTable` affichent : un export    */
/*  ne contient jamais ce que l'écran n'a pas reçu (même règle que      */
/*  `discover-export.ts`).                                              */
/* ------------------------------------------------------------------ */

export const TARGET_LIST_EXPORT_COLUMNS = [
  'kind',
  'label',
  'sublabel',
  'priority',
  'owner',
  'workStatus',
  'provenance',
  'nextAction',
  'selectionReason',
] as const
type TargetListExportColumn = (typeof TARGET_LIST_EXPORT_COLUMNS)[number]

/** Libellés d'en-tête et de valeur, résolus par l'appelant (i18n FR/EN). */
export type TargetListExportLabels = Record<TargetListExportColumn, string> & {
  kindLabel: Record<TargetListItem['kind'], string>
  priorityLabel: (priority: TargetListItem['priority']) => string
  workStatusLabel: (status: TargetListItem['work_status']) => string
  provenanceLabel: (provenance: TargetListItem['provenance']) => string
  ownerNone: string
  ownerUnknown: string
  /** #4073.1 — les six colonnes de faits du compte (« Dernier recrutement »…). */
  facts: Record<AccountFactsExportColumn, string>
}

/** #4073.1 — les cellules de faits, par identifiant de compte (`ref_id`). */
export type TargetListFactCells = Readonly<Record<string, AccountFactsExportCells>>

/** Les comptes VIVANTS de la liste : seuls leurs faits se demandent à l'API. */
export function targetListAccountIds(items: readonly TargetListItem[]): string[] {
  return [...new Set(items.filter(item => item.kind === 'account' && !item.removed_at).map(item => item.ref_id))]
}

/**
 * Même dérivation que `getTargetListOwnerLabel` (`target-list-summary.ts`),
 * pour un ÉLÉMENT plutôt que la liste elle-même — un responsable qui a
 * quitté l'espace reste NOMMÉ, jamais effacé en « Personne ».
 */
function ownerLabel(item: TargetListItem, members: WorkspaceMember[], labels: TargetListExportLabels): string {
  if (item.owner_user_id == null) return labels.ownerNone
  const owner = members.find(member => member.userId === item.owner_user_id)
  return owner?.fullName ?? owner?.email ?? labels.ownerUnknown
}

function row(
  item: TargetListItem,
  members: WorkspaceMember[],
  labels: TargetListExportLabels,
  facts: TargetListFactCells | undefined,
): string[] {
  // #4073.1 — un contact n'a pas de faits de compte : cellules vides, jamais « 0 ».
  const cells = (item.kind === 'account' ? facts?.[item.ref_id] : undefined) ?? emptyAccountFactsExportCells()
  return [
    labels.kindLabel[item.kind],
    item.label ?? '',
    item.sublabel ?? '',
    item.priority ? labels.priorityLabel(item.priority) : '',
    ownerLabel(item, members, labels),
    labels.workStatusLabel(item.work_status),
    labels.provenanceLabel(item.provenance),
    item.next_action ?? '',
    item.selection_reason ?? '',
    ...(facts ? ACCOUNT_FACTS_EXPORT_COLUMNS.map(column => cells[column]) : []),
  ]
}

/**
 * La liste rendue → CSV, dans l'ordre exact où le tableau l'affiche.
 * #4073.1 — `facts` ajoute les six colonnes de faits du compte (datés, sans
 * provenance) ; sans lui, le fichier garde exactement ses colonnes d'avant.
 */
export function targetListItemsCsv(
  items: readonly TargetListItem[],
  members: WorkspaceMember[],
  labels: TargetListExportLabels,
  facts?: TargetListFactCells,
): string {
  const headers = [
    ...TARGET_LIST_EXPORT_COLUMNS.map(column => labels[column]),
    ...(facts ? ACCOUNT_FACTS_EXPORT_COLUMNS.map(column => labels.facts[column]) : []),
  ]
  return toCsv([headers, ...items.map(item => row(item, members, labels, facts))])
}

/** `cible-<nom>-2026-09-26.csv` — daté, comme tout export qui quitte l'app. */
export function targetListExportFilename(
  list: Pick<TargetList, 'name'>,
  prefix: string,
  nowMs: number = Date.now(),
): string {
  const slug = list.name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${prefix}-${slug || 'sans-nom'}-${new Date(nowMs).toISOString().slice(0, 10)}.csv`
}
