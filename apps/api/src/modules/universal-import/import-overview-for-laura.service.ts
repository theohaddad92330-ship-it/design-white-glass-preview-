import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { TARGET_TIER_LABELS, type TargetTierLabel, universalImportOperationStatus } from '@bellum/contracts'
import { Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContextPackHistoryService } from './context-pack-history.service'
import { UniversalImportService } from './universal-import.service'

/** Combien de lignes de chaque historique Laura reçoit — le même ordre d'idée que `recent_sessions` (5). */
const RECENT_LIMIT = 5

/**
 * #4426.8 — ce que Laura lit pour « mon import a marché ? » et « combien de comptes en A ? ».
 *
 * Elle ne voyait que l'ancien assistant (`import_sessions`) : un tiering importé par l'import universel, listé dans
 * l'historique de /settings/import, lui paraissait inexistant. Cette lecture rend LES MÊMES sources que l'écran
 * (imports universels + dépôts de l'assistant « Dépose tes documents ») et le tiering posé sur les comptes. Lecture
 * seule ; aucune cellule du fichier ne sort (nom, état, compteurs).
 */
@Injectable()
export class ImportOverviewForLauraService {
  constructor(
    private readonly universal: UniversalImportService,
    private readonly contextPack: ContextPackHistoryService,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
  ) {}

  async read(workspaceId: string, userId: string) {
    const [universal, contextPack, tiering] = await Promise.all([
      this.universal.history(workspaceId, userId, RECENT_LIMIT),
      this.contextPack.list(workspaceId),
      this.tiering(workspaceId),
    ])
    return {
      universal_imports: universal.map(job => ({
        file_name: job.filename,
        status: job.status,
        imported: job.imported,
        rejected: job.rejected,
        duplicates: job.duplicates,
        error: job.error,
        created_at: job.createdAt,
        interrupted: job.interrupted,
        // #4295.1 — le mot de l'écran (vocabulaire partagé), pas l'état brut : `failed` se dit « interrompu ».
        operation_status: universalImportOperationStatus(job),
      })),
      context_pack_imports: contextPack.slice(0, RECENT_LIMIT).map(row => ({
        file_name: row.fileName,
        destination: row.destination,
        status: row.status,
        imported: row.imported,
        skipped: row.skipped,
        message: row.message,
        created_at: row.createdAt,
      })),
      tiering,
    }
  }

  /**
   * Les comptes par tier : l'import pose « Tier A/B/C » sur les ÉTIQUETTES du compte (`universal-import-planner`,
   * #4426.1) — c'est là qu'on compte, comme le filtre « Étiquette » de /accounts. `null` = aucun tier posé ; un tier
   * absent = `null`, jamais 0 ; un compte supprimé ne compte pas.
   */
  private async tiering(workspaceId: string): Promise<Record<TargetTierLabel, number | null> | null> {
    const labels = TARGET_TIER_LABELS.map(tier => `Tier ${tier}`)
    const rows = await this.accounts.query<{ label: string; count: string }[]>(
      `SELECT t AS label, COUNT(*)::text AS count
         FROM accounts a, unnest(a.tags) AS t
        WHERE a.workspace_id = $1 AND a.status <> 'deleted' AND t = ANY($2)
        GROUP BY t`,
      [workspaceId, labels],
    )
    if (rows.length === 0) return null
    const byLabel = new Map(rows.map(row => [row.label, Number(row.count)]))
    return Object.fromEntries(TARGET_TIER_LABELS.map(tier => [tier, byLabel.get(`Tier ${tier}`) ?? null])) as Record<
      TargetTierLabel,
      number | null
    >
  }
}
