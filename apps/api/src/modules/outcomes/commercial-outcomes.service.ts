import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  COMMERCIAL_OUTCOME_TYPES,
  type CommercialOutcome,
  type CommercialOutcomeSummary,
  type CreateCommercialOutcomeInput,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { CommercialOutcomeEntity } from '../../database/entities/commercial-outcome.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'

function toWire(row: CommercialOutcomeEntity): CommercialOutcome {
  return {
    id: row.id,
    accountId: row.account_id,
    contactId: row.contact_id,
    type: row.outcome_type,
    reason: row.reason,
    recordedBy: row.recorded_by,
    recordedAt: row.recorded_at.toISOString(),
  }
}

/**
 * #2126.47/.48/.50/.51/.53/.54/.55/.60 (épopée #2787) — LE LEDGER DES OUTCOMES
 * COMMERCIAUX.
 *
 * APPEND-ONLY par construction (#2126.60) : cette classe ne porte QUE `record`,
 * `list` et `summary`. Aucune méthode `update`/`delete` n'existe — ce n'est pas
 * une convention de code, c'est l'absence du chemin (même discipline que « le
 * copilote n'envoie jamais d'e-mail », doctrine c82).
 */
@Injectable()
export class CommercialOutcomesService {
  constructor(
    @InjectRepository(CommercialOutcomeEntity) private readonly outcomes: Repository<CommercialOutcomeEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
  ) {}

  private async assertAccount(workspaceId: string, accountId: string): Promise<void> {
    const account = await this.accounts.findOne({ where: { id: accountId, ...workspaceScopeWhere(workspaceId) } })
    if (!account) throw new NotFoundException('Compte introuvable')
  }

  async record(
    workspaceId: string,
    accountId: string,
    recordedBy: string,
    input: CreateCommercialOutcomeInput,
  ): Promise<CommercialOutcome> {
    await this.assertAccount(workspaceId, accountId)
    const contactId = input.contactId ?? null
    if (contactId) {
      const contact = await this.contacts.findOne({
        where: { id: contactId, account_id: accountId, ...workspaceScopeWhere(workspaceId) },
      })
      if (!contact) throw new NotFoundException('Contact introuvable sur ce compte')
    }
    const row = this.outcomes.create({
      workspace_id: workspaceId,
      account_id: accountId,
      contact_id: contactId,
      outcome_type: input.type,
      reason: input.reason ?? null,
      recorded_by: recordedBy,
    })
    return toWire(await this.outcomes.save(row))
  }

  async list(workspaceId: string, accountId: string): Promise<CommercialOutcome[]> {
    await this.assertAccount(workspaceId, accountId)
    const rows = await this.outcomes.find({
      where: { account_id: accountId, ...workspaceScopeWhere(workspaceId) },
      order: { recorded_at: 'DESC' },
    })
    return rows.map(toWire)
  }

  /**
   * #2126.56/.58/.59 — le substrat PARTAGÉ (GA-26) lu par les trois boucles :
   * le classement/les recommandations (`incorrectContactIds`, via
   * `contact-eligibility.ts`) et la qualité des données
   * (`data-hygiene.service.ts`, via {@link incorrectContactIds} seule — la
   * hygiène n'a besoin que des identifiants, jamais du compte par type).
   */
  async summary(workspaceId: string, accountId: string): Promise<CommercialOutcomeSummary> {
    await this.assertAccount(workspaceId, accountId)
    const rows = await this.outcomes.find({ where: { account_id: accountId, ...workspaceScopeWhere(workspaceId) } })
    const counts = Object.fromEntries(COMMERCIAL_OUTCOME_TYPES.map(type => [type, 0])) as Record<string, number>
    const incorrectContactIds = new Set<string>()
    for (const row of rows) {
      counts[row.outcome_type] = (counts[row.outcome_type] ?? 0) + 1
      if (row.outcome_type === 'incorrect_contact' && row.contact_id) incorrectContactIds.add(row.contact_id)
    }
    return { accountId, counts, incorrectContactIds: [...incorrectContactIds] }
  }

  /**
   * #2126.56/.58 — les fiches marquées `incorrect_contact`, TOUTE L'ESPACE (pas
   * un seul compte) : `contact-eligibility.ts` reçoit des lignes déjà filtrées
   * par compte, un lookup par workspace suffit et évite un aller-retour par
   * compte à chaque appel de classement.
   */
  async incorrectContactIds(workspaceId: string): Promise<Set<string>> {
    const rows = await this.outcomes.find({
      where: { outcome_type: 'incorrect_contact', ...workspaceScopeWhere(workspaceId) },
      select: ['contact_id'],
    })
    return new Set(rows.map(row => row.contact_id).filter((id): id is string => id !== null))
  }
}
