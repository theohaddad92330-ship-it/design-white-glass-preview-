import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { duplicatePairKey, type CrmFusionReport } from '@bellum/contracts'
import { Repository } from 'typeorm'
import { returnedRows } from '../../database/returned-rows'
import { AccountEntity } from '../../database/entities/account.entity'
import {
  CRM_FUSION_FAMILIES,
  moveCrmFusionFamily,
  undoCrmFusionFamily,
  planCrmFusionPairs,
  type CrmFusionMoved,
  type CrmFusionPair,
  type FusionCandidate,
} from './account-crm-fusion'

type SqlRunner = { query: <T = unknown>(sql: string, params?: unknown[]) => Promise<T> }

/**
 * #4603 — le RATTRAPAGE CIBLÉ des paires compte-CRM ↔ compte-analyse déjà créées (deux « Veepee »).
 *
 * ⚠️⚠️ RENVERSEMENT DE DOCTRINE DATÉ — Louis, 26/10/2026 (`c142_fusion_auto_compte_crm_compte_analyse`) :
 * ces paires-là sont fusionnées SANS DEMANDER. La décision de quelle paire, et pourquoi, est
 * `planCrmFusionPairs` (`account-crm-fusion.ts`) ; ce service lit et écrit, rien d'autre.
 *
 * Les promesses, tenues ici :
 *  - **ciblé** : l'espace ACTIF de l'appelant, une borne par passage, jamais tout le parc ;
 *  - **simulation d'abord** (`dryRun`, défaut du contrôleur) : comptée, rien n'est écrit ;
 *  - **on archive, on ne supprime pas** : la fiche absorbée passe en `archived`, garde son statut d'avant
 *    (`merged_previous_*`) et pointe vers la survivante (`merged_into_id`) ;
 *  - **l'union** : contacts, affaires, activités, runs, notes et liens CRM rejoignent la survivante ;
 *  - **journal** (`account_crm_fusions`) : les deux identifiants, la clé qui a décidé, ce qui a bougé ;
 *  - **réversible** : {@link undo} rend chaque ligne journalisée, et la paire n'est plus jamais refusionnée ;
 *  - **une correction humaine gagne** : aucun champ de la survivante n'est écrit, et une paire tranchée par
 *    un humain est comptée et laissée.
 * Le rattrapage ne part pas seul au déploiement : il faut un geste (`POST /accounts/crm-fusions/sweep`).
 */
@Injectable()
export class AccountCrmFusionService {
  private readonly logger = new Logger(AccountCrmFusionService.name)

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  /** L'espace est résolu par le CONTRÔLEUR (GA-07 : un service ne va pas chercher le service d'un autre module). */
  async sweep(
    workspaceId: string,
    userId: string,
    options: { dryRun: boolean; limit: number },
  ): Promise<CrmFusionReport> {
    const manager = this.accounts.manager as unknown as SqlRunner
    const [rows, humanDecidedPairKeys] = await Promise.all([
      this.loadCandidates(manager, workspaceId),
      this.loadHumanDecidedPairKeys(manager, workspaceId),
    ])
    const plan = planCrmFusionPairs(rows, { humanDecidedPairKeys, limit: options.limit })

    let merged = 0
    if (!options.dryRun) {
      for (const pair of plan.pairs) {
        if (await this.merge(workspaceId, pair)) merged += 1
      }
      this.logger.log('CRM ↔ analysis fusion sweep (#4603)', { workspaceId, userId, found: plan.pairs.length, merged })
    }
    return {
      dryRun: options.dryRun,
      found: plan.pairs.length,
      merged,
      ambiguous: plan.ambiguous,
      humanDecided: plan.humanDecided,
      deferred: plan.deferred,
      pairs: plan.pairs,
    }
  }

  /** Annule une fusion : les lignes journalisées reviennent, la fiche retrouve son statut d'avant. */
  async undo(workspaceId: string, userId: string, fusionId: string): Promise<{ restored: boolean }> {
    return this.accounts.manager.transaction(async raw => {
      const runner = raw as unknown as SqlRunner
      // #4783 — `UPDATE … RETURNING` rend `[lignes, nombre]` : `returnedRows`, jamais `rows[0]` à la main.
      const rows = returnedRows<{ kept_id: string; absorbed_id: string; moved: CrmFusionMoved | null }>(
        await runner.query(
          `UPDATE account_crm_fusions SET undone_at = now(), undone_by = $3
          WHERE workspace_id = $1 AND id = $2 AND undone_at IS NULL
          RETURNING kept_id, absorbed_id, moved`,
          [workspaceId, fusionId, userId],
        ),
      )
      const fusion = rows[0]
      if (!fusion) throw new NotFoundException('Fusion introuvable')
      for (const family of CRM_FUSION_FAMILIES) {
        const ids = fusion.moved?.[family.family] ?? []
        if (ids.length === 0) continue
        await undoCrmFusionFamily(runner, family, [workspaceId, fusion.kept_id, fusion.absorbed_id, ids])
      }
      const restored = returnedRows<{ id: string }>(
        await runner.query(
          `UPDATE accounts a
            SET status = a.merged_previous_status,
                commercial_status = a.merged_previous_commercial_status,
                merged_into_id = NULL, merged_at = NULL, merged_by = NULL,
                merged_previous_status = NULL, merged_previous_commercial_status = NULL
          WHERE a.workspace_id = $1 AND a.id = $2 AND a.merged_into_id = $3 AND a.merged_previous_status IS NOT NULL
          RETURNING a.id`,
          [workspaceId, fusion.absorbed_id, fusion.kept_id],
        ),
      )
      return { restored: restored.length > 0 }
    })
  }

  /**
   * Les comptes vivants de l'espace, avec ce que le planificateur doit savoir. « Venu du CRM » = `origin`
   * `crm` ou une référence externe de compte (`sync_links`, posée par chaque import CRM — y compris sur les
   * fiches d'avant le correctif, qui n'ont ni origine ni SIREN). Un import de FICHIER seul n'en est pas un.
   */
  private async loadCandidates(manager: SqlRunner, workspaceId: string): Promise<FusionCandidate[]> {
    const rows = await manager.query<FusionCandidate[]>(
      `SELECT a.id, a.company_name, a.siren, a.status, a.commercial_status, a.updated_at,
              EXISTS (SELECT 1 FROM analysis_runs r WHERE r.account_id = a.id) AS has_runs,
              (a.origin = 'crm'
                OR EXISTS (SELECT 1 FROM sync_links s
                            WHERE s.workspace_id = $1 AND s.entity_type = 'account' AND s.internal_id = a.id)
              ) AS crm_side
         FROM accounts a
        WHERE a.workspace_id = $1
          AND a.merged_into_id IS NULL
          AND a.status NOT IN ('deleted', 'archived')`,
      [workspaceId],
    )
    return rows ?? []
  }

  /** Une paire écartée ou fusionnée par un humain au balayeur des doublons, ou une fusion annulée. */
  private async loadHumanDecidedPairKeys(manager: SqlRunner, workspaceId: string): Promise<Set<string>> {
    const [decided, undone] = await Promise.all([
      manager.query<{ pair_key: string }[]>(
        `SELECT pair_key FROM duplicate_pairs
          WHERE workspace_id = $1 AND entity_type = 'account' AND decision IN ('dismissed', 'merged')`,
        [workspaceId],
      ),
      manager.query<{ kept_id: string; absorbed_id: string }[]>(
        `SELECT kept_id, absorbed_id FROM account_crm_fusions WHERE workspace_id = $1 AND undone_at IS NOT NULL`,
        [workspaceId],
      ),
    ])
    return new Set([
      ...(decided ?? []).map(row => row.pair_key),
      ...(undone ?? []).map(row => duplicatePairKey(row.kept_id, row.absorbed_id)),
    ])
  }

  /** UNE transaction par paire : une fusion à moitié faite laisserait des lignes que plus rien ne désigne. */
  private async merge(workspaceId: string, pair: CrmFusionPair): Promise<boolean> {
    try {
      return await this.accounts.manager.transaction(async raw => {
        const runner = raw as unknown as SqlRunner
        // ⚠️ En SQL, le SET lit la ligne AVANT la mise à jour : le COALESCE capture bien l'ancien statut.
        const archived = returnedRows<{ id: string }>(
          await runner.query(
            `UPDATE accounts a
              SET merged_previous_status = COALESCE(a.merged_previous_status, a.status),
                  merged_previous_commercial_status = COALESCE(a.merged_previous_commercial_status, a.commercial_status),
                  status = 'archived',
                  commercial_status = 'archived',
                  merged_into_id = $2,
                  merged_at = now(),
                  merged_by = NULL
            WHERE a.workspace_id = $1 AND a.id = $3
              AND a.merged_into_id IS NULL
              AND a.status NOT IN ('deleted', 'archived')
              AND EXISTS (SELECT 1 FROM accounts k WHERE k.workspace_id = $1 AND k.id = $2 AND k.merged_into_id IS NULL)
            RETURNING a.id`,
            [workspaceId, pair.keptId, pair.absorbedId],
          ),
        )
        if (archived.length === 0) return false
        const moved: CrmFusionMoved = {}
        for (const family of CRM_FUSION_FAMILIES) {
          const ids = await moveCrmFusionFamily(runner, family, [workspaceId, pair.keptId, pair.absorbedId])
          if (ids.length > 0) moved[family.family] = ids
        }
        await runner.query(
          `INSERT INTO account_crm_fusions (workspace_id, kept_id, absorbed_id, basis, match_key, moved)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [workspaceId, pair.keptId, pair.absorbedId, pair.basis, pair.key, JSON.stringify(moved)],
        )
        return true
      })
    } catch (error) {
      this.logger.error('CRM ↔ analysis fusion failed (#4603)', {
        workspaceId,
        keptId: pair.keptId,
        absorbedId: pair.absorbedId,
        error,
      })
      return false
    }
  }
}
