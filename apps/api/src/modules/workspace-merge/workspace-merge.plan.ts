import { createHash } from 'node:crypto'
import type {
  WorkspaceMergeDuplicateKey,
  WorkspaceMergePlanItem,
  WorkspaceMergePreview,
  WorkspaceMergeTable,
  WorkspaceMergeTableCount,
} from '@bellum/contracts'

/**
 * #4158.57 — l'APERÇU d'un rapatriement, calculé sans rien écrire (la simulation, condition e).
 * Pur : les lignes lues par le store entrent, l'aperçu sort ; son empreinte est ce que les deux
 * validations signent (condition a).
 */

/** Un compte ACTIF de l'espace lu (ni archivé, ni supprimé, ni fusionné). */
export type MergeAccountRow = {
  id: string
  label: string
  siren: string | null
  registryCountry: string | null
  registryId: string | null
}

/** Un contact ACTIF de l'espace lu. */
export type MergeContactRow = {
  id: string
  label: string
  accountId: string | null
  email: string | null
  linkedin: string | null
}

/** Neuf chiffres, espaces tolérés — sinon pas une clé (un nom identique n'en est jamais une). */
export function normalizeSiren(value: string | null): string | null {
  const digits = (value ?? '').replace(/\s/g, '')
  return /^\d{9}$/.test(digits) ? digits : null
}

export function normalizeEmail(value: string | null): string | null {
  const email = (value ?? '').trim().toLowerCase()
  return email.includes('@') ? email : null
}

/** Même normalisation que `LINKEDIN_SQL` côté store : sans protocole, `www.`, requête ni `/` final. */
export function normalizeLinkedin(value: string | null): string | null {
  const url = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, '')
    .split('?')[0]!
    .split('#')[0]!
    .replace(/\/+$/, '')
  return url.length > 0 ? url : null
}

function registryKey(row: MergeAccountRow): string | null {
  const id = (row.registryId ?? '').trim()
  return id ? `${(row.registryCountry ?? '').trim().toUpperCase()}|${id}` : null
}

/** Les clés à chercher dans l'espace cible — jamais une requête sur un nom. */
export function duplicateLookupKeys(accounts: readonly MergeAccountRow[], contacts: readonly MergeContactRow[]) {
  return {
    sirens: [...new Set(accounts.map(a => normalizeSiren(a.siren)).filter((s): s is string => s !== null))],
    registries: [
      ...new Map(
        accounts
          .filter(a => registryKey(a) !== null)
          .map(a => [
            registryKey(a)!,
            { country: (a.registryCountry ?? '').trim().toUpperCase(), id: a.registryId!.trim() },
          ]),
      ).values(),
    ],
    emails: [...new Set(contacts.map(c => normalizeEmail(c.email)).filter((e): e is string => e !== null))],
    linkedins: [...new Set(contacts.map(c => normalizeLinkedin(c.linkedin)).filter((l): l is string => l !== null))],
  }
}

export type DuplicateLookupKeys = ReturnType<typeof duplicateLookupKeys>

const byId = <T extends { id: string }>(rows: readonly T[]): T[] => [...rows].sort((a, b) => a.id.localeCompare(b.id))

export function buildMergePreview(input: {
  sourceWorkspaceId: string
  targetWorkspaceId: string
  accounts: readonly MergeAccountRow[]
  contacts: readonly MergeContactRow[]
  targetAccounts: readonly MergeAccountRow[]
  targetContacts: readonly MergeContactRow[]
}): WorkspaceMergePreview {
  const accountBySiren = new Map<string, string>()
  const accountByRegistry = new Map<string, string>()
  for (const row of byId(input.targetAccounts)) {
    const siren = normalizeSiren(row.siren)
    if (siren && !accountBySiren.has(siren)) accountBySiren.set(siren, row.id)
    const registry = registryKey(row)
    if (registry && !accountByRegistry.has(registry)) accountByRegistry.set(registry, row.id)
  }
  const contactByEmail = new Map<string, string>()
  const contactByLinkedin = new Map<string, string>()
  for (const row of byId(input.targetContacts)) {
    const email = normalizeEmail(row.email)
    if (email && !contactByEmail.has(email)) contactByEmail.set(email, row.id)
    const linkedin = normalizeLinkedin(row.linkedin)
    if (linkedin && !contactByLinkedin.has(linkedin)) contactByLinkedin.set(linkedin, row.id)
  }

  const items: WorkspaceMergePlanItem[] = []
  const proposedAccounts = new Set<string>()
  const carriedAccounts = new Set<string>()
  for (const account of byId(input.accounts)) {
    carriedAccounts.add(account.id)
    const siren = normalizeSiren(account.siren)
    const registry = registryKey(account)
    const match: [string, WorkspaceMergeDuplicateKey] | null =
      siren && accountBySiren.has(siren)
        ? [accountBySiren.get(siren)!, 'siren']
        : registry && accountByRegistry.has(registry)
          ? [accountByRegistry.get(registry)!, 'registry']
          : null
    if (match) proposedAccounts.add(account.id)
    items.push({
      table: 'accounts',
      sourceId: account.id,
      outcome: match ? 'duplicate_proposed' : 'copied',
      targetId: match ? match[0] : null,
      sourceAccountId: null,
      duplicateKey: match ? match[1] : null,
      label: account.label,
    })
  }

  for (const contact of byId(input.contacts)) {
    // Un contact dont le compte n'est pas rapatrié (archivé dans l'espace perso) y reste.
    if (contact.accountId !== null && !carriedAccounts.has(contact.accountId)) continue
    const email = normalizeEmail(contact.email)
    const linkedin = normalizeLinkedin(contact.linkedin)
    const match: [string, WorkspaceMergeDuplicateKey] | null =
      email && contactByEmail.has(email)
        ? [contactByEmail.get(email)!, 'email']
        : linkedin && contactByLinkedin.has(linkedin)
          ? [contactByLinkedin.get(linkedin)!, 'linkedin']
          : null
    const held = !match && contact.accountId !== null && proposedAccounts.has(contact.accountId)
    items.push({
      table: 'contacts',
      sourceId: contact.id,
      outcome: match ? 'duplicate_proposed' : held ? 'held_with_account' : 'copied',
      targetId: match ? match[0] : null,
      sourceAccountId: contact.accountId,
      duplicateKey: match ? match[1] : null,
      label: contact.label,
    })
  }

  return {
    sourceWorkspaceId: input.sourceWorkspaceId,
    targetWorkspaceId: input.targetWorkspaceId,
    tables: (['accounts', 'contacts'] as const).map(table => countTable(table, items)),
    items,
  }
}

function countTable(table: WorkspaceMergeTable, items: readonly WorkspaceMergePlanItem[]): WorkspaceMergeTableCount {
  const rows = items.filter(item => item.table === table)
  return {
    table,
    total: rows.length,
    moving: rows.filter(item => item.outcome === 'copied').length,
    duplicates: rows.filter(item => item.outcome === 'duplicate_proposed').length,
    held: rows.filter(item => item.outcome === 'held_with_account').length,
  }
}

/**
 * L'EMPREINTE de l'aperçu : tout ce qui sera ÉCRIT (espaces, chaque ligne, son sort, sa cible), rien de
 * ce qui ne l'est pas — un compte renommé entre l'aperçu et la validation ne la périme pas, un compte
 * ajouté, supprimé ou devenu doublon, si.
 */
export function mergePreviewHash(preview: WorkspaceMergePreview): string {
  const canonical = JSON.stringify([
    preview.sourceWorkspaceId,
    preview.targetWorkspaceId,
    preview.items.map(item => [item.table, item.sourceId, item.outcome, item.targetId, item.sourceAccountId]),
  ])
  return createHash('sha256').update(canonical).digest('hex')
}
