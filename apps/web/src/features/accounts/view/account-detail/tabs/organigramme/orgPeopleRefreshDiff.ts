import type { OrgEntityDiffEntry, OrgPeopleRefreshDiff, OrgPersonDiffEntry, OrgPersonDiffKind } from '@bellum/contracts'

/**
 * #2554.1 / #2554.2 — lit le diff nommé qu'une actualisation d'organigramme a
 * posé sur `raw_analysis.org.peopleRefreshDiff` (voir
 * `AccountsService.withNotConfirmedPeople`, apps/api). Normalisation défensive
 * comme le reste des lectures de `raw_analysis` dans ce dossier
 * (`orgStructureData.ts`) : un blob illisible rend `null`, jamais une valeur
 * inventée.
 *
 * `null` = pas d'actualisation portant ce diff (dossier jamais actualisé
 * depuis ce chantier, ou premier peuplement — #2502, distinct).
 */
export function readOrgPeopleRefreshDiff(rawAnalysis: unknown): OrgPeopleRefreshDiff | null {
  const org = readRecord(readRecord(rawAnalysis)?.org)
  const raw = readRecord(org?.peopleRefreshDiff)
  if (!raw) return null
  const asOf = safeString(raw.asOf)
  if (!asOf) return null

  return {
    asOf,
    reverified: entries(raw.reverified),
    changedPosition: entries(raw.changedPosition),
    new: entries(raw.new),
    notConfirmed: entries(raw.notConfirmed),
    // #2318.4 — « nouvelles entités ». Absent d'un blob antérieur à ce lot :
    // `entityEntries` rend `[]`, jamais une entité inventée.
    newEntities: entityEntries(raw.newEntities),
  }
}

function entityEntries(value: unknown): OrgEntityDiffEntry[] {
  if (!Array.isArray(value)) return []
  const out: OrgEntityDiffEntry[] = []
  for (const item of value) {
    const record = readRecord(item)
    const entityId = safeString(record?.entityId)
    const name = safeString(record?.name)
    if (!entityId || !name) continue
    out.push({ entityId, name })
  }
  return out
}

const DIFF_KINDS: readonly OrgPersonDiffKind[] = ['reverified', 'changedPosition', 'new', 'notConfirmed']

function entries(value: unknown): OrgPersonDiffEntry[] {
  if (!Array.isArray(value)) return []
  const out: OrgPersonDiffEntry[] = []
  for (const item of value) {
    const record = readRecord(item)
    const personId = safeString(record?.personId)
    const fullName = safeString(record?.fullName)
    const kind = safeString(record?.kind)
    if (!personId || !fullName || !DIFF_KINDS.includes(kind as OrgPersonDiffKind)) continue
    const entry: OrgPersonDiffEntry = { personId, fullName, kind: kind as OrgPersonDiffKind }
    const previousTitle = nullableString(record?.previousTitle)
    const nextTitle = nullableString(record?.nextTitle)
    if (previousTitle) entry.previousTitle = previousTitle
    if (nextTitle) entry.nextTitle = nextTitle
    out.push(entry)
  }
  return out
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function nullableString(value: unknown): string | undefined {
  const text = safeString(value)
  return text.length > 0 ? text : undefined
}
