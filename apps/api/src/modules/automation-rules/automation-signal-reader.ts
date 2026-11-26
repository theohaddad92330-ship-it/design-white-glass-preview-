import { Inject, Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import { AUTOMATION_RULE_LIMITS, AUTOMATION_SIGNAL_SOURCES } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { CanonicalTriggerEventEntity } from '../../database/entities/canonical-trigger-event.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import type { SignalCandidate } from './automation-engine'
import { AUTOMATION_MISSIONS_PORT, type AutomationMissionsPort } from './automation-ports'
import type { AutomationRuleEntity } from '../../database/entities/automation-rule.entity'

const DAY_MS = 86_400_000

/**
 * Qui représente le mieux un compte : le décideur technique d'abord, puis le
 * économique, l'achats, le relais — le reste ensuite. UN contact (c74).
 */
const ROLE_RANK: Record<string, number> = { technical: 0, economic: 1, procurement: 2, champion: 3 }

export function bestContactOf(
  contacts: readonly Pick<ContactEntity, 'id' | 'decision_role' | 'created_at'>[],
): string | null {
  const ranked = [...contacts].sort((a, b) => {
    const byRole = (ROLE_RANK[a.decision_role ?? ''] ?? 4) - (ROLE_RANK[b.decision_role ?? ''] ?? 4)
    if (byRole !== 0) return byRole
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
  return ranked[0]?.id ?? null
}

type TriggerRow = { id: string; payload: Record<string, unknown> | null; occurred_at: Date | string }

/**
 * Lot L-D1 (#4167) — LIT les signaux d'une règle, aux ÉMETTEURS qui existent :
 * le registre canonique des déclencheurs (`canonical_trigger_events`) ou les deux
 * lectures déjà écrites (comptes sans geste tracé, fins de mission de l'ATS).
 * Elle n'écrit rien et n'invente aucun signal.
 *
 * Un signal ne concerne la personne que si le compte est à elle (propriétaire) ou
 * si elle y a un contact : les autres sont ÉCARTÉS sans trace (ce n'est pas son
 * signal), jamais comptés comme « sans contact ». Un compte à elle SANS contact
 * donne un candidat sans contact — la règle le consigne, honnêtement.
 */
@Injectable()
export class AutomationSignalReader {
  constructor(
    @InjectRepository(CanonicalTriggerEventEntity) private readonly events: Repository<CanonicalTriggerEventEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(ProjectNeedEntity) private readonly needs: Repository<ProjectNeedEntity>,
    @Optional() @Inject(AUTOMATION_MISSIONS_PORT) private readonly missions?: AutomationMissionsPort,
  ) {}

  /** `readable: false` = la source n'a pas pu être lue : la règle n'a PAS tourné, son compteur reste « non mesuré ». */
  async read(rule: AutomationRuleEntity, now: Date): Promise<{ readable: boolean; candidates: SignalCandidate[] }> {
    const source = AUTOMATION_SIGNAL_SOURCES[rule.signal]
    if (source.type === 'trigger')
      return { readable: true, candidates: await this.fromTriggers(rule, source.kind, now) }
    if (source.reader === 'untouched_accounts') {
      return { readable: true, candidates: await this.fromUntouchedAccounts(rule, now) }
    }
    return this.fromEndingMissions(rule, now)
  }

  /** Les contacts de la personne, par compte — un seul aller-retour pour tous les comptes. */
  private async contactsByAccount(
    userId: string,
    workspaceId: string,
    accountIds: string[],
  ): Promise<Map<string, string>> {
    if (accountIds.length === 0) return new Map()
    const rows = await this.contacts.find({
      where: {
        user_id: userId,
        ...workspaceScopeWhere(workspaceId),
        account_id: In(accountIds),
        hidden: false,
        merged_into_id: IsNull(),
      },
      select: ['id', 'account_id', 'decision_role', 'created_at'],
    })
    const grouped = new Map<string, ContactEntity[]>()
    for (const row of rows) {
      if (!row.account_id) continue
      grouped.set(row.account_id, [...(grouped.get(row.account_id) ?? []), row])
    }
    return new Map(
      [...grouped].flatMap(([accountId, list]) => {
        const best = bestContactOf(list)
        return best ? [[accountId, best] as const] : []
      }),
    )
  }

  private async fromTriggers(rule: AutomationRuleEntity, kind: string, now: Date): Promise<SignalCandidate[]> {
    const since = new Date(
      Math.max(rule.created_at.getTime(), now.getTime() - AUTOMATION_RULE_LIMITS.signalWindowDays * DAY_MS),
    )
    const rows = await this.events.manager.query<TriggerRow[]>(
      `SELECT id, payload, occurred_at FROM canonical_trigger_events
        WHERE workspace_id = $1 AND kind = $2 AND occurred_at >= $3
          AND (status IS NULL OR status <> 'resolved')
          AND (expires_at IS NULL OR expires_at > $4)
        ORDER BY occurred_at ASC LIMIT 200`,
      [rule.workspace_id, kind, since, now],
    )
    if (rows.length === 0) return []

    // Le sujet de chaque événement → un compte et/ou un contact.
    const subjectOf = (row: TriggerRow) => ({
      type: String(row.payload?.['subjectType'] ?? ''),
      id: String(row.payload?.['subjectId'] ?? ''),
      accountId: typeof row.payload?.['accountId'] === 'string' ? (row.payload['accountId'] as string) : null,
    })
    const contactIds = rows.flatMap(row => (subjectOf(row).type === 'contact' ? [subjectOf(row).id] : []))
    const needIds = rows.flatMap(row => (subjectOf(row).type === 'project_need' ? [subjectOf(row).id] : []))
    const [contactRows, needRows] = await Promise.all([
      contactIds.length
        ? this.contacts.find({
            where: { id: In(contactIds), ...workspaceScopeWhere(rule.workspace_id) },
            select: ['id', 'account_id', 'user_id'],
          })
        : Promise.resolve([] as ContactEntity[]),
      needIds.length
        ? this.needs.find({
            where: { id: In(needIds), ...workspaceScopeWhere(rule.workspace_id) },
            select: ['id', 'account_id'],
          })
        : Promise.resolve([] as ProjectNeedEntity[]),
    ])
    const contactById = new Map(contactRows.map(contact => [contact.id, contact]))
    const needAccount = new Map(needRows.map(need => [need.id, need.account_id]))

    const resolved = rows.map(row => {
      const subject = subjectOf(row)
      const contact = subject.type === 'contact' ? contactById.get(subject.id) : undefined
      const accountId =
        (subject.type === 'account' ? subject.id : null) ??
        (subject.type === 'project_need' ? (needAccount.get(subject.id) ?? null) : null) ??
        contact?.account_id ??
        subject.accountId
      return { row, subject, contact, accountId }
    })

    const accountIds = [...new Set(resolved.flatMap(item => (item.accountId ? [item.accountId] : [])))]
    const [ownedAccounts, bestByAccount] = await Promise.all([
      accountIds.length
        ? this.accounts.find({
            where: { id: In(accountIds), user_id: rule.user_id, ...workspaceScopeWhere(rule.workspace_id) },
            select: ['id'],
          })
        : Promise.resolve([] as AccountEntity[]),
      this.contactsByAccount(rule.user_id, rule.workspace_id, accountIds),
    ])
    const owned = new Set(ownedAccounts.map(account => account.id))

    const out: SignalCandidate[] = []
    for (const { row, subject, contact, accountId } of resolved) {
      // Un contact précis (nouveau décideur) : c'est LUI, s'il est à la personne.
      const directContact = contact && contact.user_id === rule.user_id ? contact.id : null
      const contactId = directContact ?? (accountId ? (bestByAccount.get(accountId) ?? null) : null)
      const relevant = contactId !== null || (accountId !== null && owned.has(accountId))
      if (!relevant) continue
      const evidence = typeof row.payload?.['evidence'] === 'string' ? (row.payload['evidence'] as string) : ''
      out.push({
        signalRef: `trigger:${row.id}`,
        accountId,
        contactId,
        evidence: evidence || `${subject.type} ${subject.id}`,
        occurredAt: new Date(row.occurred_at),
      })
    }
    return out
  }

  private async fromUntouchedAccounts(rule: AutomationRuleEntity, now: Date): Promise<SignalCandidate[]> {
    const days = rule.inactive_days
    if (!days) return []
    const cutoff = new Date(now.getTime() - days * DAY_MS)
    // Même définition de « compte suivi » et même table de gestes que l'alerte « compte sans action »
    // (`InterventionsSweeper.untouchedAccounts`) ; ici au seuil CHOISI par la règle. Un compte sans AUCUN
    // geste tracé n'a pas de date : « depuis N jours » ne se dit pas, il n'est pas retenu.
    const rows = await this.accounts.query<{ id: string; company_name: string; last_action_at: Date | string }[]>(
      `SELECT a.id, a.company_name, max(ua.created_at) AS last_action_at
         FROM accounts a
         JOIN user_actions ua ON ua.account_id = a.id
        WHERE a.workspace_id = $1 AND a.user_id = $2
          AND a.commercial_status IN ('watching', 'opportunity', 'customer')
        GROUP BY a.id, a.company_name
       HAVING max(ua.created_at) < $3
        ORDER BY max(ua.created_at) ASC
        LIMIT 200`,
      [rule.workspace_id, rule.user_id, cutoff],
    )
    const best = await this.contactsByAccount(
      rule.user_id,
      rule.workspace_id,
      rows.map(row => row.id),
    )
    return rows.map(row => {
      const last = new Date(row.last_action_at)
      const idle = Math.floor((now.getTime() - last.getTime()) / DAY_MS)
      return {
        signalRef: `untouched:${row.id}`,
        accountId: row.id,
        contactId: best.get(row.id) ?? null,
        evidence: `${row.company_name} : aucune action depuis ${idle} jours.`,
        occurredAt: last,
      }
    })
  }

  private async fromEndingMissions(
    rule: AutomationRuleEntity,
    now: Date,
  ): Promise<{ readable: boolean; candidates: SignalCandidate[] }> {
    if (!this.missions) return { readable: false, candidates: [] }
    const snapshot = await this.missions.endingMissions(rule.user_id)
    if (!snapshot.readable) return { readable: false, candidates: [] }
    const names = [...new Set(snapshot.missions.flatMap(mission => (mission.companyName ? [mission.companyName] : [])))]
    const accounts = names.length
      ? await this.accounts.find({
          where: { user_id: rule.user_id, ...workspaceScopeWhere(rule.workspace_id) },
          select: ['id', 'company_name'],
        })
      : []
    const accountByName = new Map(accounts.map(account => [account.company_name.trim().toLowerCase(), account.id]))
    const best = await this.contactsByAccount(rule.user_id, rule.workspace_id, [...new Set(accountByName.values())])
    const candidates = snapshot.missions.map(mission => {
      const accountId = mission.companyName
        ? (accountByName.get(mission.companyName.trim().toLowerCase()) ?? null)
        : null
      return {
        signalRef: `mission_end:${mission.id}`,
        accountId,
        contactId: accountId ? (best.get(accountId) ?? null) : null,
        evidence: `Mission « ${mission.title} »${mission.companyName ? ` chez ${mission.companyName}` : ''} : fin dans ${mission.daysRemaining} jours.`,
        occurredAt: now,
      }
    })
    return { readable: true, candidates }
  }
}
