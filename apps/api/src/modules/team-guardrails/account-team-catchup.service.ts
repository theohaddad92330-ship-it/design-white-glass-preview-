import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AccountTeamMemberEntity } from '../../database/entities/account-team-member.entity'

type AccountTeamCatchupResult = {
  workspaceId: string
  dryRun: boolean
  /** Lignes d'équipe actives dont le membre n'est plus dans l'espace. */
  departedTeamRows: number
  /** Périmètres actifs dont le membre n'est plus dans l'espace. */
  departedScopes: number
  /** Doublon en base : co-équipier actif qui est aussi `assigned_to`. Compté, jamais archivé ici (Q3). */
  responsibleAlsoMember: number
  /** Lignes réellement archivées (0 en dry-run). */
  archived: number
}

/**
 * #4996 L2 — rattrapage du défaut « le partant reste inscrit » sur les lignes DÉJÀ en base (doctrine du 18/09, #2543) :
 * CIBLÉ (un espace, jamais tout le parc), À LA DEMANDE (ni démarrage ni cron), `dryRun` qui compte d'abord. On
 * archive (`removed_at`), on ne supprime pas, et l'auteur humain du geste signe `removed_by` — d'où `removedBy`
 * obligatoire hors dry-run. Le doublon responsable/co-équipier (Q3) est SEULEMENT compté : le service le dédoublonne à
 * la lecture, son archivage est un geste à part.
 */
@Injectable()
export class AccountTeamCatchupService {
  constructor(@InjectRepository(AccountTeamMemberEntity) private readonly team: Repository<AccountTeamMemberEntity>) {}

  async run(input: { workspaceId: string; dryRun: boolean; removedBy?: string }): Promise<AccountTeamCatchupResult> {
    const { workspaceId, dryRun, removedBy } = input
    if (!dryRun && !removedBy) throw new BadRequestException('removedBy (l’auteur du geste) est requis hors dry-run.')
    const q = (sql: string, params: unknown[]) => this.team.manager.query(sql, params)
    const departed = (table: string) =>
      `FROM ${table} WHERE workspace_id = $1 AND removed_at IS NULL
         AND user_id NOT IN (SELECT user_id FROM workspace_members WHERE workspace_id = $1)`
    const count = async (table: string): Promise<number> =>
      Number(((await q(`SELECT count(*) AS n ${departed(table)}`, [workspaceId])) as { n: string }[])[0]?.n ?? 0)
    const departedTeamRows = await count('account_team_members')
    const departedScopes = await count('account_team_scopes')
    const duplicates = (await q(
      `SELECT count(*) AS n FROM account_team_members t JOIN accounts a ON a.id = t.account_id
        WHERE t.workspace_id = $1 AND t.removed_at IS NULL AND a.assigned_to = t.user_id`,
      [workspaceId],
    )) as { n: string }[]
    let archived = 0
    if (!dryRun) {
      for (const table of ['account_team_members', 'account_team_scopes']) {
        const [, affected] = (await q(
          `UPDATE ${table} SET removed_at = now(), removed_by = $2
            WHERE workspace_id = $1 AND removed_at IS NULL
              AND user_id NOT IN (SELECT user_id FROM workspace_members WHERE workspace_id = $1)`,
          [workspaceId, removedBy],
        )) as [unknown, number]
        archived += Number(affected ?? 0)
      }
    }
    return {
      workspaceId,
      dryRun,
      departedTeamRows,
      departedScopes,
      responsibleAlsoMember: Number(duplicates[0]?.n ?? 0),
      archived,
    }
  }
}
