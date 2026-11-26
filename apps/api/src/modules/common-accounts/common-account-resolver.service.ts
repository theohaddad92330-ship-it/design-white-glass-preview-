import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import {
  type CommonAccountResolution,
  type CommonAccountsReader,
  resolveCommonAccounts,
} from '../../common/common-account-links'

/**
 * Lot 793 (Louis 04/11/2026) — LE résolveur compte de l'espace → identifiants communs (BM-A du pack v2.1, fiches DF,
 * groupe et filiales), sur le référentiel pivot `common_account_links`. La règle vit dans
 * `common/common-account-links.ts` (SIREN, puis domaine, puis nom/alias UNIQUE ; ambiguïté = vide, comptée) ; ce
 * service la sert au CONTRÔLEUR, qui en fait une porte liée à l'espace pour les lecteurs (lignes de signaux, parcours).
 *
 * Toujours filtré par l'espace : `resolveForWorkspace(workspaceId, ids)` lit les comptes par `workspace_id = $1 AND
 * id = ANY($2)` — un id d'un autre espace ne résout rien.
 */
@Injectable()
export class CommonAccountResolverService {
  private readonly logger = new Logger(CommonAccountResolverService.name)

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async resolveForWorkspace(workspaceId: string, accountIds: readonly string[]): Promise<CommonAccountResolution> {
    const resolution = await resolveCommonAccounts(
      (sql, params) => this.dataSource.query(sql, params),
      workspaceId,
      accountIds,
    )
    const { resolved, ambiguous, none } = resolution.counts
    if (ambiguous > 0)
      this.logger.log(
        `référentiel pivot : ${resolved} résolu(s), ${ambiguous} ambigu(s) laissé(s) vides, ${none} sans clé`,
      )
    return resolution
  }

  /** La porte que le contrôleur passe aux lecteurs : l'espace est lié ICI, le lecteur ne passe que ses comptes. */
  readerFor(workspaceId: string): CommonAccountsReader {
    return accountIds => this.resolveForWorkspace(workspaceId, accountIds)
  }
}
