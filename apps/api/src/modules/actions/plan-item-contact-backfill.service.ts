import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Not, Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { unambiguousContact, nameKey, type BookEntry } from './plan-contact-match'

export type PlanItemContactBackfillResult = {
  dryRun: boolean
  /** Étapes ouvertes sans contact, lues dans l'espace. */
  examined: number
  /** Rattachées (ou qui le seraient, en simulation). */
  attached: number
  /** Laissées intactes : plusieurs contacts possibles, ou aucun. */
  ambiguous: number
  /** Étapes ouvertes qui portaient DÉJÀ un contact : jamais touchées. */
  alreadyAttached: number
}

/**
 * #4521.1 (doctrine #2543 « un correctif RATTRAPE l'existant ») — `contact_id` d'une étape de plan n'était résolu
 * qu'à la CRÉATION : les étapes déjà en base l'ont NULL, donc ni « Générer le mail » ni lien vers le contact.
 *
 * CIBLÉ : UN espace, jamais le parc. Ne part PAS seul — un geste explicite du back-office le déclenche
 * (`PlanItemContactBackfillController`). Idempotent : n'écrit que là où `contact_id IS NULL` (la condition est
 * dans l'écriture même), donc une correction humaine gagne toujours et un rejeu n'écrit rien de plus.
 */
@Injectable()
export class PlanItemContactBackfillService {
  private readonly logger = new Logger(PlanItemContactBackfillService.name)

  constructor(
    @InjectRepository(ActionPlanItemEntity) private readonly items: Repository<ActionPlanItemEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
  ) {}

  async run(workspaceId: string, options: { dryRun: boolean }): Promise<PlanItemContactBackfillResult> {
    const result: PlanItemContactBackfillResult = {
      dryRun: options.dryRun,
      examined: 0,
      attached: 0,
      ambiguous: 0,
      alreadyAttached: 0,
    }
    // La portée d'espace : les comptes DE l'espace. Contacts et étapes sont lus et écrits à travers elle.
    const accountIds = (await this.accounts.find({ where: { workspace_id: workspaceId }, select: ['id'] })).map(
      account => account.id,
    )
    if (accountIds.length === 0) return result

    const open = { account_id: In(accountIds), done: false, execution_status: In(['todo', 'snoozed', 'prepared']) }
    result.alreadyAttached = await this.items.count({ where: { ...open, contact_id: Not(IsNull()) } })
    const orphans = await this.items.find({
      where: { ...open, contact_id: IsNull() },
      select: ['id', 'account_id', 'label'],
    })
    result.examined = orphans.length
    if (orphans.length === 0) return this.report(workspaceId, result)

    const bookByAccount = new Map<string, BookEntry[]>()
    const rows = await this.contacts.find({
      where: { account_id: In([...new Set(orphans.map(orphan => orphan.account_id))]) },
      select: ['id', 'account_id', 'full_name'],
    })
    for (const row of rows) {
      if (!row.account_id) continue
      const list = bookByAccount.get(row.account_id) ?? []
      list.push({ id: row.id, key: nameKey(row.full_name ?? '') })
      bookByAccount.set(row.account_id, list)
    }

    for (const orphan of orphans) {
      const contactId = unambiguousContact(orphan.label, bookByAccount.get(orphan.account_id) ?? [])
      if (!contactId) {
        result.ambiguous += 1
        continue
      }
      if (options.dryRun) {
        result.attached += 1
        continue
      }
      const written = await this.items.update(
        { id: orphan.id, account_id: In(accountIds), contact_id: IsNull() },
        { contact_id: contactId },
      )
      if ((written.affected ?? 0) > 0) result.attached += 1
      else result.alreadyAttached += 1
    }
    return this.report(workspaceId, result)
  }

  private report(workspaceId: string, result: PlanItemContactBackfillResult): PlanItemContactBackfillResult {
    this.logger.log(
      `plan-item contact backfill workspace=${workspaceId} dryRun=${result.dryRun} examined=${result.examined} ` +
        `attached=${result.attached} ambiguous=${result.ambiguous} alreadyAttached=${result.alreadyAttached}`,
    )
    return result
  }
}
