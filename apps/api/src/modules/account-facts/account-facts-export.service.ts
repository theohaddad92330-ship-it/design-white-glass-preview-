import { Injectable } from '@nestjs/common'
import { accountFactsExportCells, type AccountFactsExportResponse } from '@bellum/contracts'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { AccountFactsService } from './account-facts.service'

/** Combien de comptes se lisent à la fois : le lecteur fait ~10 requêtes par compte. */
const CONCURRENCY = 5

/**
 * #4073.1 — les faits du compte, en CELLULES d'export. Aucune lecture neuve :
 * c'est le lecteur unique (`AccountFactsService`, #4069.1) qui parle, puis le
 * contrat partagé (`accountFactsExportCells`) qui choisit, date et épure.
 * Rien n'est écrit, rien ne sort d'ici : le navigateur assemble le fichier
 * (même porte de sortie que tout CSV — `useDataExit`).
 */
@Injectable()
export class AccountFactsExportService {
  constructor(
    private readonly facts: AccountFactsService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  async cellsFor(userId: string, accountIds: readonly string[]): Promise<AccountFactsExportResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const unique = [...new Set(accountIds)]
    const cells: AccountFactsExportResponse['cells'] = {}
    for (let i = 0; i < unique.length; i += CONCURRENCY) {
      await Promise.all(
        unique.slice(i, i + CONCURRENCY).map(async accountId => {
          const read = await this.facts.forAccount({ workspaceId, userId, accountId })
          // Un compte absent de l'espace n'a pas de ligne : dans une liste, une absence ne fait aucune ligne.
          if (read) cells[accountId] = accountFactsExportCells(read.facts)
        }),
      )
    }
    return { cells }
  }
}
