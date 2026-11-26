import { isSegmentCollectionStale } from '@bellum/contracts'
import { In, IsNull, MoreThan } from 'typeorm'
import { nameMatchesAccount } from './contact-employer'

/**
 * #4928.4 — le RATTRAPAGE de la garde d'employeur (`guard_search_hits`, #4929) sur les contacts DÉJÀ en base.
 * Décision Louis du 18/09/2026 (« un correctif de collecte RATTRAPE l'existant ») :
 *  - CIBLÉ : un espace OU un compte, jamais tout le parc ;
 *  - par SEGMENT : les contacts seuls, jamais une analyse entière, aucune date de collecte réécrite ;
 *  - « concerné » : la collecte du segment est ANTÉRIEURE à la date de la capacité (`isSegmentCollectionStale`, GA-26) ;
 *  - ne part JAMAIS seul au déploiement : lancé à la main, en SIMULATION par défaut ; écrire exige le compte affiché.
 * Idempotent (un contact déjà écarté n'est plus candidat) et reprenable (`afterAccountId`, comptes triés par id).
 * Une absence ne rejette jamais ; une correction humaine gagne (identité confirmée, source manuelle/CRM/import).
 */

/** #4929 (260b2ded, 30/10/2026 22:09 +01:00) — l'instant où la garde d'employeur devient réelle à la collecte. */
export const EMPLOYER_GUARD_CAPABILITY_AT = '2026-10-30T21:09:23.000Z'

export const EMPLOYER_CATCHUP_REASON = 'employeur hors du compte et de son groupe (garde d’employeur, rattrapage)'

const HUMAN_SOURCES = new Set(['manual', 'crm', 'import'])

type AccountRow = {
  id: string
  company_name: string | null
  raw_analysis: Record<string, unknown> | null
  contacts_collected_at: Date | null
}
type ContactRow = {
  id: string
  full_name: string | null
  entity: string | null
  source: string | null
  identity_confirmed_at: Date | null
  excluded_at: Date | null
}
type Repos = {
  accounts: { find(options: unknown): Promise<AccountRow[]> }
  contacts: {
    find(options: unknown): Promise<ContactRow[]>
    update(criteria: unknown, patch: unknown): Promise<unknown>
  }
}
export type EmployerCatchUpReport = {
  apply: boolean
  concerned: number
  toArchive: number
  archived: number
  lastAccountId: string | null
  lines: string[]
}

/** Les noms de l'entité du compte : sa raison sociale et les entités que son dossier déclare. */
function accountNames(account: AccountRow): string[] {
  const declared = Array.isArray(account.raw_analysis?.entities) ? (account.raw_analysis?.entities as unknown[]) : []
  const names = declared.flatMap(entry =>
    typeof entry === 'string'
      ? [entry]
      : typeof (entry as { name?: unknown })?.name === 'string'
        ? [(entry as { name: string }).name]
        : [],
  )
  return [account.company_name ?? '', ...names].filter(Boolean)
}

export async function runContactsEmployerCatchUp(
  input: Repos & {
    apply: boolean
    workspaceId?: string
    accountId?: string
    /** Reprise : on repart après ce compte (ordre par id). */
    afterAccountId?: string
    /** Le compte AFFICHÉ par la simulation : écrire sans lui est refusé. */
    confirmedCount?: number
    capabilityAt?: string
  },
): Promise<EmployerCatchUpReport> {
  if (!input.workspaceId && !input.accountId) {
    throw new Error('Cible obligatoire : --espace <id> ou --compte <id> (jamais tout le parc).')
  }
  const capabilityAt = input.capabilityAt ?? EMPLOYER_GUARD_CAPABILITY_AT
  const accounts = await input.accounts.find({
    where: {
      ...(input.accountId ? { id: input.accountId } : {}),
      ...(input.workspaceId ? { workspace_id: input.workspaceId } : {}),
      ...(input.afterAccountId ? { id: MoreThan(input.afterAccountId) } : {}),
    },
    select: { id: true, company_name: true, raw_analysis: true, contacts_collected_at: true },
    order: { id: 'ASC' },
  })
  const plan: { account: AccountRow; ids: string[]; names: string[] }[] = []
  for (const account of accounts) {
    if (!isSegmentCollectionStale(account.contacts_collected_at, capabilityAt)) continue
    const rows = await input.contacts.find({
      where: { account_id: account.id, deleted_at: IsNull(), excluded_at: IsNull() },
      select: { id: true, full_name: true, entity: true, source: true, identity_confirmed_at: true, excluded_at: true },
    })
    const names = accountNames(account)
    const wrong = rows.filter(
      row =>
        !row.excluded_at &&
        !row.identity_confirmed_at &&
        !HUMAN_SOURCES.has((row.source ?? '').toLowerCase()) &&
        (row.entity ?? '').trim() !== '' &&
        names.length > 0 &&
        !nameMatchesAccount(row.entity, names),
    )
    plan.push({
      account,
      ids: wrong.map(row => row.id),
      names: wrong.map(row => `${row.full_name ?? '?'} (${row.entity})`),
    })
  }
  const toArchive = plan.reduce((sum, item) => sum + item.ids.length, 0)
  const report: EmployerCatchUpReport = {
    apply: input.apply,
    concerned: plan.length,
    toArchive,
    archived: 0,
    lastAccountId: plan.at(-1)?.account.id ?? null,
    lines: plan.map(
      item =>
        `${item.account.company_name ?? item.account.id} — ${item.ids.length} contact(s) : ${item.names.join(', ')}`,
    ),
  }
  if (!input.apply) return report
  if (input.confirmedCount !== toArchive) {
    throw new Error(
      `Le compte confirmé (${input.confirmedCount ?? 'absent'}) n’est pas celui de la simulation (${toArchive}) : rien n’est écrit.`,
    )
  }
  const now = new Date()
  for (const item of plan) {
    if (item.ids.length === 0) continue
    await input.contacts.update({ id: In(item.ids) }, { excluded_at: now, exclusion_reason: EMPLOYER_CATCHUP_REASON })
    report.archived += item.ids.length
  }
  return report
}
