import { Injectable, Logger } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { CommercialBriefStep } from './commercial-brief.step'

/**
 * Point 45 (« briefs comptes », 01/10/2026) — LE RATTRAPAGE du brief commercial.
 *
 * Doctrine « un correctif de collecte RATTRAPE l'existant » : le brief n'est
 * produit qu'à la fin d'une analyse ; les comptes DÉJÀ analysés n'en auront
 * jamais tant qu'on ne les rejoue pas. Ce service les rejoue — et seulement :
 *
 * - **ciblé** : un espace (obligatoire — jamais tout le parc) et un plafond
 *   (défaut {@link COMMERCIAL_BRIEF_BACKFILL_DEFAULT_LIMIT}, dur
 *   {@link COMMERCIAL_BRIEF_BACKFILL_MAX_LIMIT}), éventuellement une liste d'ids
 *   de CET espace — un id d'un autre espace est refusé, jamais traité ;
 * - **par SEGMENT** : l'étape brief seule (`CommercialBriefStep`), jamais
 *   l'analyse entière, donc aucun crédit d'analyse débité ni dossier modifié ;
 * - **sans écraser** : un brief existant reste intact (`keepExisting`), sauf
 *   `force` explicite ;
 * - **idempotent et reprenable** : une 2e course ne refait rien de ce qui est
 *   écrit (la sélection exclut les comptes pourvus) ; `afterId` / `nextCursor`
 *   reprennent après le dernier compte traité — un brief REJETÉ par ses
 *   contrôles n'est pas écrit, donc il se représenterait à chaque course sans ce
 *   curseur ;
 * - **séquentiel** : un appel modèle à la fois, jamais de fan-out ;
 * - **ne part jamais seul** : sa SEULE porte d'entrée est
 *   `AdminCommercialBriefBackfillController` (`internal/admin`, secret interne) —
 *   ni `onApplicationBootstrap`, ni tâche planifiée.
 *
 * Chaque requête porte `workspace_id` DANS le WHERE (GA-380).
 */

/** Petit à dessein : un appel modèle payant par compte. */
export const COMMERCIAL_BRIEF_BACKFILL_DEFAULT_LIMIT = 20
export const COMMERCIAL_BRIEF_BACKFILL_MAX_LIMIT = 100

interface CommercialBriefBackfillInput {
  /** Obligatoire : le rattrapage est toujours borné à UN espace. */
  workspaceId: string
  /** Sous-ensemble de comptes de cet espace ; absent ⇒ les comptes sans brief. */
  accountIds?: string[]
  limit?: number
  /** Remplace un brief existant — geste explicite, jamais le défaut. */
  force?: boolean
  /** Reprise : ne considère que les comptes d'id strictement supérieur. */
  afterId?: string
}

export interface CommercialBriefBackfillResult {
  processed: number
  written: number
  rejected: number
  failed: number
  /** Brief déjà présent, laissé intact. */
  alreadyThere: number
  skipped: number
  /** Ids demandés qui ne sont pas de cet espace (ou n'existent pas). */
  refused: string[]
  /** Dernier id traité — à repasser en `afterId` pour reprendre. */
  nextCursor: string | null
  stoppedBecause: 'disabled' | null
}

/** Comptes réellement analysés : un `raw_analysis` écrit, pas en cours, pas supprimé. */
const ANALYSED = `raw_analysis IS NOT NULL AND status NOT IN ('analyzing', 'deleted', 'archived')`

@Injectable()
export class CommercialBriefBackfillService {
  private readonly logger = new Logger(CommercialBriefBackfillService.name)

  constructor(
    private readonly dataSource: DataSource,
    private readonly step: CommercialBriefStep,
  ) {}

  async run(input: CommercialBriefBackfillInput): Promise<CommercialBriefBackfillResult> {
    const workspaceId = input.workspaceId?.trim()
    if (!workspaceId) throw new Error('workspaceId requis : le rattrapage est borné à un espace')
    const limit = Math.min(
      Math.max(Math.trunc(input.limit ?? COMMERCIAL_BRIEF_BACKFILL_DEFAULT_LIMIT), 1),
      COMMERCIAL_BRIEF_BACKFILL_MAX_LIMIT,
    )
    const force = input.force === true
    const result: CommercialBriefBackfillResult = {
      processed: 0,
      written: 0,
      rejected: 0,
      failed: 0,
      alreadyThere: 0,
      skipped: 0,
      refused: [],
      nextCursor: null,
      stoppedBecause: null,
    }

    const targets = input.accountIds?.length
      ? await this.targetsFromList(workspaceId, input.accountIds, limit, result)
      : await this.targetsFromWorkspace(workspaceId, limit, force, input.afterId)

    for (const accountId of targets.slice(0, limit)) {
      result.processed += 1
      result.nextCursor = accountId
      try {
        const outcome = await this.step.produceCommercialBrief(accountId, workspaceId, { keepExisting: !force })
        if (outcome === 'written') result.written += 1
        else if (outcome === 'rejected') result.rejected += 1
        else if (outcome === 'exists') result.alreadyThere += 1
        else if (outcome === 'failed') result.failed += 1
        else if (outcome === 'skipped') result.skipped += 1
        else if (outcome === 'disabled') {
          // COMMERCIAL_BRIEF_ENABLED=false : rien ne sera produit — on n'insiste pas.
          result.stoppedBecause = 'disabled'
          break
        }
      } catch (err) {
        // Le step ne jette pas ; ceinture et bretelles — un compte ne coupe pas le lot.
        result.failed += 1
        this.logger.warn('Rattrapage du brief : compte en échec (lot poursuivi)', {
          accountId,
          error: err instanceof Error ? err.name : 'unknown',
        })
      }
    }
    // Les ids seulement — jamais le contenu d'un dossier.
    this.logger.log('Rattrapage du brief commercial terminé', { workspaceId, limit, force, ...result })
    return result
  }

  /** Les ids demandés, filtrés sur l'espace — le reste est REFUSÉ. */
  private async targetsFromList(
    workspaceId: string,
    requested: string[],
    limit: number,
    result: CommercialBriefBackfillResult,
  ): Promise<string[]> {
    const wanted = [...new Set(requested.map(id => id.trim()).filter(Boolean))]
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `SELECT id FROM accounts WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND ${ANALYSED} ORDER BY id`,
      [workspaceId, wanted],
    )
    // Pas de LIMIT SQL ici : la liste est déjà bornée par le DTO, et un id au-delà
    // du plafond n'est pas « refusé » — il n'est simplement pas pour cette course.
    const found = new Set(rows.map(row => row.id))
    result.refused = wanted.filter(id => !found.has(id))
    return rows.map(row => row.id).slice(0, limit)
  }

  private async targetsFromWorkspace(
    workspaceId: string,
    limit: number,
    force: boolean,
    afterId?: string,
  ): Promise<string[]> {
    const params: unknown[] = [workspaceId]
    let where = `workspace_id = $1 AND ${ANALYSED}`
    if (!force) where += ` AND NOT (raw_analysis ? 'commercial_brief')`
    if (afterId?.trim()) {
      params.push(afterId.trim())
      where += ` AND id > $${params.length}`
    }
    params.push(limit)
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `SELECT id FROM accounts WHERE ${where} ORDER BY id LIMIT $${params.length}`,
      params,
    )
    return rows.map(row => row.id)
  }
}
