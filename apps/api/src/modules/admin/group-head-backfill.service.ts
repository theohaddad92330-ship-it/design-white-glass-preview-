import { Injectable, Logger } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { IaClient } from '../ia/ia.client'

/**
 * #3917 — LE RATTRAPAGE de `accounts.group_head_siren`.
 *
 * Le rattachement « Filiale de X » a été corrigé en amont (plusieurs détenteurs ⇒ aucune tête, nom de la
 * tête confirmé par le registre) ; les comptes DÉJÀ analysés gardent pourtant l'ancien SIREN. Doctrine « un
 * correctif de collecte rattrape l'existant, ciblé, par segment » :
 *
 * - **ciblé** : un espace (obligatoire), un plafond (défaut {@link GROUP_HEAD_BACKFILL_DEFAULT_LIMIT}, dur
 *   {@link GROUP_HEAD_BACKFILL_MAX_LIMIT}), `afterId` / `nextCursor` pour reprendre ;
 * - **par segment** : seulement le lien de groupe — un appel GET au moteur (cache Pappers par SIREN, aucun
 *   crédit client), jamais l'analyse entière ;
 * - **n'écrase jamais une correction humaine** : les comptes dont `groupHeadSiren` / `groupRole` portent une
 *   provenance `human` sont exclus de la sélection ; seuls les liens posés par la source (`pappers`) bougent ;
 * - **ne retire rien** : une réponse muette ne distingue pas « tête non confirmée » d'une panne — le lien est
 *   laissé tel quel et le compte est NOMMÉ (`unconfirmedIds`) pour décision de l'opérateur ;
 * - **ne part jamais seul** : sa seule porte est `AdminGroupHeadBackfillController` (`internal/admin`,
 *   secret interne).
 */
export const GROUP_HEAD_BACKFILL_DEFAULT_LIMIT = 50
export const GROUP_HEAD_BACKFILL_MAX_LIMIT = 100

interface GroupHeadBackfillInput {
  workspaceId: string
  limit?: number
  afterId?: string
}

export interface GroupHeadBackfillResult {
  processed: number
  updated: number
  unchanged: number
  /** Le moteur n'a pas confirmé une tête « filiale » : lien laissé tel quel. */
  unconfirmed: number
  unconfirmedIds: string[]
  failed: number
  nextCursor: string | null
}

@Injectable()
export class GroupHeadBackfillService {
  private readonly logger = new Logger(GroupHeadBackfillService.name)

  constructor(
    private readonly dataSource: DataSource,
    private readonly ia: IaClient,
  ) {}

  async run(input: GroupHeadBackfillInput): Promise<GroupHeadBackfillResult> {
    const workspaceId = input.workspaceId?.trim()
    if (!workspaceId) throw new Error('workspaceId requis : le rattrapage est borné à un espace')
    const limit = Math.min(
      Math.max(Math.trunc(input.limit ?? GROUP_HEAD_BACKFILL_DEFAULT_LIMIT), 1),
      GROUP_HEAD_BACKFILL_MAX_LIMIT,
    )
    const params: unknown[] = [workspaceId]
    let where = `a.workspace_id = $1
      AND a.siren IS NOT NULL AND a.group_role = 'filiale' AND a.group_head_siren IS NOT NULL
      AND a.group_link_source = 'pappers'
      AND a.status NOT IN ('analyzing', 'deleted', 'archived')
      AND NOT EXISTS (
        SELECT 1 FROM field_provenance fp
         WHERE fp.entity_type = 'account' AND fp.entity_id = a.id AND fp.source = 'human'
           AND fp.field IN ('groupHeadSiren', 'groupRole'))`
    if (input.afterId?.trim()) {
      params.push(input.afterId.trim())
      where += ` AND a.id > $${params.length}`
    }
    params.push(limit)
    const rows: Array<{ id: string; siren: string; group_head_siren: string }> = await this.dataSource.query(
      `SELECT a.id, a.siren, a.group_head_siren FROM accounts a WHERE ${where} ORDER BY a.id LIMIT $${params.length}`,
      params,
    )

    const result: GroupHeadBackfillResult = {
      processed: 0,
      updated: 0,
      unchanged: 0,
      unconfirmed: 0,
      unconfirmedIds: [],
      failed: 0,
      nextCursor: null,
    }
    for (const row of rows) {
      result.processed += 1
      result.nextCursor = row.id
      try {
        const affiliation = await this.ia.groupAffiliation(row.siren)
        if (!affiliation || affiliation.role !== 'filiale') {
          result.unconfirmed += 1
          result.unconfirmedIds.push(row.id)
        } else if (affiliation.headSiren === row.group_head_siren) {
          result.unchanged += 1
        } else {
          // La condition de provenance est re-posée dans l'UPDATE : une correction humaine arrivée entre
          // la sélection et l'écriture gagne.
          await this.dataSource.manager.query(
            `UPDATE accounts a SET group_head_siren = $1, group_link_observed_at = now()
              WHERE a.id = $2 AND a.workspace_id = $3 AND a.group_link_source = 'pappers'
                AND NOT EXISTS (
                  SELECT 1 FROM field_provenance fp
                   WHERE fp.entity_type = 'account' AND fp.entity_id = a.id AND fp.source = 'human'
                     AND fp.field IN ('groupHeadSiren', 'groupRole'))`,
            [affiliation.headSiren, row.id, workspaceId],
          )
          result.updated += 1
        }
      } catch (err) {
        result.failed += 1
        this.logger.warn('Rattrapage du lien de groupe : compte en échec (lot poursuivi)', {
          accountId: row.id,
          error: err instanceof Error ? err.name : 'unknown',
        })
      }
    }
    this.logger.log('Rattrapage du lien de groupe terminé', {
      workspaceId,
      limit,
      ...result,
      unconfirmedIds: undefined,
    })
    return result
  }
}
