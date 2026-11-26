import { NotFoundException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { AccountMemoryKind } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountMemoryEntity } from '../../database/entities/account-memory.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/** Un apprentissage à écrire — sa nature, et son contenu tel qu'extrait. */
type AccountMemoryLearning = { kind: AccountMemoryKind; content: string }

/**
 * #2777 — LA MÉMOIRE DU COMPTE. Bande `n4_bounded_auto` (voir la migration
 * `AccountMemory1796321340147`) : écrit directement, sans file de validation
 * — elle ne touche ni CRM ni ERP, la porte BEL-INT-603 ne la concerne pas.
 *
 * Un compte hors de l'espace de l'appelant n'écrit rien — même garde que
 * `ProjectPipelineService.addNeedForAccount` : un identifiant de compte qui
 * ne serait pas vérifié laisserait deviner l'existence d'un compte d'un autre
 * espace par le message d'erreur.
 */
@Injectable()
export class AccountMemoryService {
  constructor(
    @InjectRepository(AccountMemoryEntity) private readonly memory: Repository<AccountMemoryEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /**
   * Écrit chaque apprentissage RETENU. Un contenu vide n'écrit rien pour cette
   * entrée — jamais une ligne fabriquée pour faire un compte rond.
   */
  async record(
    userId: string,
    accountId: string,
    learnings: readonly AccountMemoryLearning[],
  ): Promise<{ created: number }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const account = await this.accounts.findOne({ where: { id: accountId, workspace_id: workspaceId } })
    if (!account) throw new NotFoundException('Compte introuvable')

    let created = 0
    for (const learning of learnings) {
      const content = learning.content.trim()
      if (!content) continue
      await this.memory.save(
        this.memory.create({
          workspace_id: workspaceId,
          account_id: accountId,
          user_id: userId,
          kind: learning.kind,
          content,
          // #2777 — même vocabulaire que `contacts.source` : la mention vient
          // de l'extraction d'un compte rendu, pas d'une saisie ni d'un outil
          // connecté.
          source: 'meeting',
        }),
      )
      created += 1
    }
    return { created }
  }
}
