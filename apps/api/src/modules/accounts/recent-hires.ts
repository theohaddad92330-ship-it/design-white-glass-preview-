import {
  RECENT_HIRE_WINDOW_DAYS,
  countExaminedContacts,
  recentHires,
  type AccountRecentHires,
  type RecentHireContact,
  type RecentHireProfile,
} from '@bellum/contracts'
import { IsNull, type EntityManager } from 'typeorm'
import { ContactEntity } from '../../database/entities/contact.entity'

/**
 * #3970 (lot P07) — les contacts d'UN compte, tels que la lecture des
 * recrutements récents les rend. Masqués et supprimés écartés, l'espace
 * vérifié une seconde fois dans la requête (la porte d'appartenance du
 * contrôleur passe avant), et une borne : un compte de 2 000 contacts ne
 * transforme pas l'onglet en export.
 *
 * Lecture par `ContactEntity` (GA-405) : jamais un SQL brut de plus sur
 * `contacts`, pour que la portée d'un contact se pose à un seul endroit.
 */
export const RECENT_HIRES_CONTACT_LIMIT = 1000

type ContactsPort = (accountId: string, workspaceId: string) => Promise<RecentHireContact[]>

/** Le port de production : les contacts visibles du compte, dans l'espace, bornés. */
export function recentHireContactsReader(manager: EntityManager): ContactsPort {
  return async (accountId, workspaceId) =>
    manager.find(ContactEntity, {
      select: ['id', 'full_name', 'title', 'email', 'phone', 'linkedin_url', 'apollo_enrichment'],
      where: { account_id: accountId, workspace_id: workspaceId, hidden: false, deleted_at: IsNull() },
      order: { updated_at: 'DESC' },
      take: RECENT_HIRES_CONTACT_LIMIT,
    }) as Promise<RecentHireContact[]>
}

/** La lecture complète : contacts du compte → recrutements récents + pertinence. */
export async function loadAccountRecentHires(
  readContacts: ContactsPort,
  input: { workspaceId: string; accountId: string; companyName: string; profile: RecentHireProfile; nowMs?: number },
): Promise<AccountRecentHires> {
  const contacts = await readContacts(input.accountId, input.workspaceId)
  return {
    windowDays: RECENT_HIRE_WINDOW_DAYS,
    examinedContacts: countExaminedContacts(contacts),
    hires: recentHires(contacts, { companyName: input.companyName, profile: input.profile, nowMs: input.nowMs }),
  }
}
