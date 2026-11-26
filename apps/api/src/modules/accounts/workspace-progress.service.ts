import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import type { WorkspaceProgress } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'

/**
 * Les natures de `user_actions` qui disent « préparée » (message généré/copié, appel préparé) ou
 * « envoyée » (message envoyé) — celles que l'historique des actions nomme déjà (`actions.service`).
 * Une analyse lancée ou une tâche cochée n'est pas une action commerciale.
 */
const PREPARED_OR_SENT_ACTION_TYPES = [
  'message_copied',
  'message_sent',
  'plan_action_message_generated',
  'plan_action_message_copied',
  'plan_action_message_sent',
  'plan_action_call_prepared',
]

/**
 * #5011.1 — L'AVANCEMENT COMPTÉ D'UN ESPACE, lu pour que la suite d'une réponse de Laura en dépende.
 *
 * Trois comptes, un filtre : `workspace_id`. Jamais l'espace d'un autre (test de REFUS), jamais une
 * valeur devinée. Un compte « analysé » est `status = 'completed'` — ce que Laura appelle ainsi
 * (`account-counts.ts`) ; les comptes supprimés ne comptent pas.
 */
@Injectable()
export class WorkspaceProgressService {
  constructor(
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(UserActionEntity) private readonly actions: Repository<UserActionEntity>,
  ) {}

  async read(workspaceId: string): Promise<WorkspaceProgress> {
    const [accounts, contacts, actions] = await Promise.all([
      this.accounts.count({ where: { workspace_id: workspaceId, status: 'completed' } }),
      this.contacts.count({ where: { workspace_id: workspaceId } }),
      // #5011 — seules les actions préparées/envoyées comptent (Louis 31/10)
      this.actions.count({ where: { workspace_id: workspaceId, action_type: In(PREPARED_OR_SENT_ACTION_TYPES) } }),
    ])
    return { accounts, contacts, actions }
  }
}
