import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, MoreThan, Repository } from 'typeorm'
import { composeAccountChanges, type AccountChanges } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ACCOUNT_FACTS_READER, type AccountFactsReader } from '../account-facts/module-tokens'

/** Combien de contacts arrivés / de corrections on lit pour UN compte : une borne, jamais un total tronqué en silence. */
const READ_LIMIT = 200

type CorrectionRow = { object_id?: unknown; old_value: unknown; new_value: unknown; created_at: Date | string }

const isoDay = (value: Date | string): string => new Date(value).toISOString().slice(0, 10)
const asText = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null)

/**
 * #4180 (EX-10) — CE QUI A CHANGÉ SUR UN COMPTE SUIVI DEPUIS LA DERNIÈRE VÉRIFICATION.
 *
 * Le lecteur unique des faits du compte (offres, besoins documentés, événements — datés du FAIT) et deux
 * lectures d'espace : les contacts arrivés (nouveaux responsables) et les changements d'entité enregistrés
 * (corrections de l'organigramme, `entityId`). La comparaison elle-même est `composeAccountChanges`
 * (`@bellum/contracts`) : ce service ne fait que lire, TOUJOURS sous l'espace appelant et le compte.
 *
 * Aucune écriture, aucun rafraîchissement : le service ne promet pas de revérification automatique.
 */
@Injectable()
export class AccountChangesService {
  private readonly logger = new Logger(AccountChangesService.name)

  constructor(
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    @Optional() @Inject(ACCOUNT_FACTS_READER) private readonly accountFacts?: AccountFactsReader,
  ) {}

  /** `null` = lecteur des faits absent ou compte absent de l'espace : rien n'est affirmé. */
  async changes(args: {
    workspaceId: string
    userId: string
    accountId: string
    companyName: string
    lastCheckedAt: Date | null
  }): Promise<AccountChanges | null> {
    const { workspaceId, userId, accountId, companyName, lastCheckedAt } = args
    if (!this.accountFacts) return null
    const account = { id: accountId, name: companyName }
    if (lastCheckedAt === null) {
      // Sans référence, rien n'est comparable : on ne lit rien (ni « rien de nouveau » ni « 0 »).
      const unread = await this.accountFacts.forAccount({ workspaceId, userId, accountId })
      return unread
        ? composeAccountChanges({
            account,
            lastCheckedAt: null,
            facts: [],
            newManagers: [],
            entityChanges: [],
            knownContacts: 0,
          })
        : null
    }
    const read = await this.accountFacts.forAccount({ workspaceId, userId, accountId })
    if (!read) return null

    const [newManagers, entityChanges, knownContacts] = await Promise.all([
      this.newManagers(workspaceId, accountId, lastCheckedAt),
      this.entityChanges(workspaceId, accountId, lastCheckedAt),
      this.contactCount(workspaceId, accountId),
    ])
    return composeAccountChanges({
      account,
      lastCheckedAt: lastCheckedAt.toISOString(),
      facts: read.facts,
      newManagers,
      entityChanges,
      knownContacts,
    })
  }

  private async newManagers(workspaceId: string, accountId: string, since: Date) {
    try {
      // Par le dépôt `ContactEntity`, jamais un SQL brut de plus (GA-405 : la portée d'un contact se lit à un seul endroit).
      const rows = await this.contacts.find({
        where: {
          workspace_id: workspaceId,
          account_id: accountId,
          deleted_at: IsNull(),
          excluded_at: IsNull(),
          created_at: MoreThan(since),
        },
        select: ['full_name', 'title', 'entity', 'created_at'],
        order: { created_at: 'DESC' },
        take: READ_LIMIT,
      })
      return rows.flatMap(row => {
        const name = asText(row.full_name)
        const title = asText(row.title)
        // Sans nom NI titre, la ligne n'a rien à dire : on n'affiche pas ce qu'on n'a pas.
        if (!name && !title) return []
        return [
          {
            label: name && title ? `${name} — ${title}` : (name ?? `Rôle à identifier — ${title}`),
            date: isoDay(row.created_at),
            entity: asText(row.entity),
          },
        ]
      })
    } catch (error) {
      this.logger.warn(`changements du compte : nouveaux contacts illisibles — ${(error as Error).message}`)
      return []
    }
  }

  private async entityChanges(workspaceId: string, accountId: string, since: Date) {
    try {
      const corrections = await this.accounts.manager.query<CorrectionRow[]>(
        `SELECT cor.object_id, cor.old_value, cor.new_value, cor.created_at
           FROM org_graph_corrections cor
          WHERE cor.workspace_id = $1 AND cor.account_id = $2
            AND cor.object_type = 'person' AND cor.field = 'entityId'
            AND cor.reverted_at IS NULL AND cor.created_at > $3
          ORDER BY cor.created_at DESC
          LIMIT ${READ_LIMIT}`,
        [workspaceId, accountId, since],
      )
      const ids = [...new Set(corrections.flatMap(row => [asText(row.old_value), asText(row.new_value)]))].filter(
        (id): id is string => id !== null,
      )
      if (ids.length === 0) return []
      const entities = await this.accounts.manager.query<Array<{ id: string; name: string }>>(
        `SELECT e.id::text AS id, e.name
           FROM account_entities e
          WHERE e.workspace_id = $1 AND e.account_id = $2 AND e.id::text = ANY($3::text[])`,
        [workspaceId, accountId, ids],
      )
      const nameOf = new Map(entities.map(entity => [entity.id, entity.name]))
      const personOf = await this.orgPeopleNames(workspaceId, accountId)
      return corrections.flatMap(row => {
        const from = nameOf.get(asText(row.old_value) ?? '')
        const to = nameOf.get(asText(row.new_value) ?? '')
        // Une entité qu'on ne sait pas nommer ne fait aucune ligne : jamais un identifiant brut à l'écran.
        if (!from || !to) return []
        // #4180.8 — le nom de la personne quand l'organigramme du compte la porte ; sinon « Une personne ».
        const who = personOf.get(asText(row.object_id) ?? '') ?? 'Une personne'
        return [{ label: `${who} a changé d’entité : ${from} → ${to}`, date: isoDay(row.created_at), entity: to }]
      })
    } catch (error) {
      this.logger.warn(`changements du compte : changements d’entité illisibles — ${(error as Error).message}`)
      return []
    }
  }

  /** #4180.8 — nœud d'organigramme (`orgGraph.people[].id`, l'`object_id` de la correction) → nom lisible. */
  private async orgPeopleNames(workspaceId: string, accountId: string): Promise<Map<string, string>> {
    const names = new Map<string, string>()
    try {
      const [row] = await this.accounts.manager.query<Array<{ raw_analysis: unknown }>>(
        `SELECT raw_analysis FROM accounts WHERE id = $1 AND workspace_id = $2`,
        [accountId, workspaceId],
      )
      const people = (row?.raw_analysis as { org?: { orgGraph?: { people?: unknown } } } | null)?.org?.orgGraph?.people
      for (const person of Array.isArray(people) ? (people as Array<Record<string, unknown>>) : []) {
        const id = asText(person['id'])
        const name = asText(person['fullName'])
        if (id && name) names.set(id, name.trim())
      }
    } catch (error) {
      this.logger.warn(`changements du compte : organigramme illisible — ${(error as Error).message}`)
    }
    return names
  }

  private async contactCount(workspaceId: string, accountId: string): Promise<number> {
    try {
      return await this.contacts.count({
        where: { workspace_id: workspaceId, account_id: accountId, deleted_at: IsNull(), excluded_at: IsNull() },
      })
    } catch (error) {
      this.logger.warn(`changements du compte : contacts non comptés — ${(error as Error).message}`)
      return 0
    }
  }
}
