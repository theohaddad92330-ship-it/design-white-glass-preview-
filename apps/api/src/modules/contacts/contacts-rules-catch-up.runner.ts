import { isContactRulesCatchupNeeded } from '@bellum/contracts'
import { In, IsNull } from 'typeorm'
import { accountDomainsFrom, HOMONYM_EXCLUSION_REASON, selectHomonymsToArchive } from './contact-employer'

/**
 * LUDOVIC-C LC.1 (b) — le RATTRAPAGE CIBLÉ du segment contacts pour l'opérateur : même règle
 * que le geste de la fiche (`ContactsService.applyCurrentContactRules`), sur UN espace ou UN
 * compte — jamais tout le parc, jamais au déploiement. Simulation par défaut. Un compte dont la
 * collecte ou la remise aux règles est postérieure à la capacité est sauté
 * (`isContactRulesCatchupNeeded`, le MÊME critère que l'écran, GA-26).
 */
type AccountRow = {
  id: string
  company_name: string | null
  website: string | null
  contacts_collected_at: Date | null
  contacts_rules_applied_at: Date | null
}
type ContactRow = {
  id: string
  full_name: string | null
  email: string | null
  source: string | null
  identity_confirmed_at: Date | null
  excluded_at: Date | null
}

type Repos = {
  accounts: {
    find(options: unknown): Promise<AccountRow[]>
    update(criteria: unknown, patch: unknown): Promise<unknown>
  }
  contacts: {
    find(options: unknown): Promise<ContactRow[]>
    update(criteria: unknown, patch: unknown): Promise<unknown>
  }
}

type CatchUpReport = { apply: boolean; concerned: number; archived: number; lines: string[] }

export async function runContactsRulesCatchUp(
  input: Repos & { apply: boolean; workspaceId?: string; accountId?: string },
): Promise<CatchUpReport> {
  if (!input.workspaceId && !input.accountId) {
    throw new Error('Cible obligatoire : --espace <id> ou --compte <id> (jamais tout le parc).')
  }
  const accounts = await input.accounts.find({
    where: {
      ...(input.accountId ? { id: input.accountId } : {}),
      ...(input.workspaceId ? { workspace_id: input.workspaceId } : {}),
    },
    select: {
      id: true,
      company_name: true,
      website: true,
      contacts_collected_at: true,
      contacts_rules_applied_at: true,
    },
  })
  const report: CatchUpReport = { apply: input.apply, concerned: 0, archived: 0, lines: [] }
  for (const account of accounts) {
    if (!isContactRulesCatchupNeeded(account.contacts_collected_at, account.contacts_rules_applied_at)) continue
    report.concerned += 1
    const rows = await input.contacts.find({
      where: { account_id: account.id, deleted_at: IsNull(), excluded_at: IsNull() },
      select: { id: true, full_name: true, email: true, source: true, identity_confirmed_at: true, excluded_at: true },
    })
    const ids = selectHomonymsToArchive(rows, accountDomainsFrom(account.website))
    report.archived += ids.length
    const names = rows.filter(row => ids.includes(row.id)).map(row => row.full_name ?? '?')
    report.lines.push(
      `${account.company_name ?? account.id} — ${ids.length} homonyme(s)${names.length ? ` : ${names.join(', ')}` : ''}`,
    )
    if (!input.apply) continue
    const now = new Date()
    if (ids.length)
      await input.contacts.update({ id: In(ids) }, { excluded_at: now, exclusion_reason: HOMONYM_EXCLUSION_REASON })
    await input.accounts.update({ id: account.id }, { contacts_rules_applied_at: now })
  }
  return report
}
