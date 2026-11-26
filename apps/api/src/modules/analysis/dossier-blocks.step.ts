import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { IaClient } from '../ia/ia.client'
import { addCostToLatestAnalysisRun } from './analysis-run-cost'
import { DOSSIER_FACT_KEYS } from './commercial-brief.step'
import {
  computeDataReliabilityNotes,
  computeFinancialIndicators,
  DOSSIER_BLOCK_KEYS,
  dossierBlockKeysToRefresh,
  HUMAN_CORRECTED_BLOCKS_KEY,
  sanitizeSynthesisNotes,
  SYNTHESIS_BLOCK_KEYS,
} from './dossier-blocks'

/**
 * #4078 — parité démo : l'étape qui écrit les cinq blocs du dossier complet
 * (01 axes de lecture, 14 écosystème, 15 domaines d'opportunité, 16 indicateurs
 * financiers, 17 fiabilité) après une VRAIE analyse, pour qu'un compte analysé
 * porte la même panoplie qu'en démo.
 *
 * - 16 et 17 sont CALCULÉS (`dossier-blocks.ts`), sans modèle ;
 * - 01, 14, 15 viennent d'UN appel IA groupé (`POST /dossier-blocks`, modèle du
 *   brief voisin) sur la même liste blanche que le brief (`DOSSIER_FACT_KEYS`) :
 *   ce que les phases 1-4 ont DÉJÀ collecté — aucune collecte neuve, aucun crédit
 *   débité ; le coût modèle s'ajoute au dernier run (point 46).
 *
 * Une ré-analyse RAFRAÎCHIT un bloc déjà posé (import, analyse antérieure) — décision
 * Louis 15/10/2026 — sauf une correction humaine (`human_corrected_blocks`), qui gagne
 * toujours, et le garde est dans l'UPDATE. Un bloc vide n'écrit rien : il ne détruit
 * pas l'ancien (on n'affiche pas ce qu'on n'a pas). Best-effort : ne jette jamais.
 */

type DossierBlocksOutcome = 'written' | 'nothing' | 'exists' | 'skipped' | 'failed'

/** La liste blanche du brief, MOINS les cinq blocs eux-mêmes : on ne se relit pas. */
const SYNTHESIS_INPUT_KEYS = DOSSIER_FACT_KEYS.filter(key => !(DOSSIER_BLOCK_KEYS as readonly string[]).includes(key))

/**
 * Écrit (rafraîchit) chaque clé SAUF celles listées dans `human_corrected_blocks`
 * AU MOMENT de l'écriture (`jsonb_each` filtré) : une correction posée entre la
 * lecture et l'UPDATE reste intacte. `jsonb_object_agg` sur zéro ligne rend NULL, d'où
 * le `COALESCE`.
 */
const WRITE_REFRESH = `UPDATE accounts
    SET raw_analysis = COALESCE(raw_analysis, '{}'::jsonb) || COALESCE(
      (SELECT jsonb_object_agg(e.key, e.value)
         FROM jsonb_each($1::jsonb) AS e
        WHERE NOT (COALESCE(raw_analysis -> '${HUMAN_CORRECTED_BLOCKS_KEY}', '[]'::jsonb) ? e.key)),
      '{}'::jsonb)
  WHERE id = $2 AND workspace_id = $3`

const STAMP_COLLECTED_AT = `UPDATE accounts SET dossier_blocks_collected_at = $1 WHERE id = $2 AND workspace_id = $3`

@Injectable()
export class DossierBlocksStep {
  private readonly logger = new Logger(DossierBlocksStep.name)

  constructor(
    private readonly ia: IaClient,
    private readonly dataSource: DataSource,
    // Horloge injectable pour les tests (« comptes anciens », « signaux anciens »).
    @Optional() @Inject('DOSSIER_BLOCKS_CLOCK') private readonly clock: () => Date = () => new Date(),
  ) {}

  async produceDossierBlocks(accountId: string, workspaceId: string | null): Promise<DossierBlocksOutcome> {
    if (!workspaceId) return 'skipped'
    try {
      const rows: Array<{ company_name: string | null; raw_analysis: Record<string, unknown> | null }> =
        await this.dataSource.query(
          'SELECT company_name, raw_analysis FROM accounts WHERE id = $1 AND workspace_id = $2 LIMIT 1',
          [accountId, workspaceId],
        )
      const row = rows[0]
      const accountName = row?.company_name?.trim()
      if (!row || !accountName) return 'skipped'
      const raw = row.raw_analysis ?? {}
      const toProduce = new Set(dossierBlockKeysToRefresh(raw))
      if (toProduce.size === 0) {
        await this.stampCollectedAt(accountId, workspaceId)
        return 'exists'
      }

      const patch: Record<string, unknown[]> = {}
      // #4078.4 / #4078.5 — calculés, sans modèle.
      if (toProduce.has('financial_indicators')) patch.financial_indicators = computeFinancialIndicators(raw)
      if (toProduce.has('data_reliability_notes'))
        patch.data_reliability_notes = computeDataReliabilityNotes(raw, this.clock())
      // #4078.1-.3 — un seul appel modèle pour les trois blocs de lecture.
      const synthesisKeys = SYNTHESIS_BLOCK_KEYS.filter(key => toProduce.has(key))
      const synthesis =
        synthesisKeys.length > 0 ? await this.synthesize(accountId, accountName, raw, synthesisKeys) : {}
      if (synthesis) Object.assign(patch, synthesis)

      const written = Object.fromEntries(Object.entries(patch).filter(([, notes]) => notes.length > 0))
      if (Object.keys(written).length > 0)
        await this.dataSource.query(WRITE_REFRESH, [JSON.stringify(written), accountId, workspaceId])
      // Un échec du modèle laisse 01/14/15 à produire : le segment reste NON daté, donc
      // concerné par le rattrapage (et l'écran le dit) — jamais présumé à jour.
      if (synthesis) await this.stampCollectedAt(accountId, workspaceId)
      if (Object.keys(written).length === 0) return 'nothing'
      // Les CLÉS et leurs tailles, jamais le contenu : il vient du dossier du client.
      this.logger.log('Blocs du dossier écrits', {
        accountId,
        blocks: Object.fromEntries(Object.entries(written).map(([key, notes]) => [key, notes.length])),
      })
      return 'written'
    } catch (err) {
      this.logger.warn('Blocs du dossier non produits (non bloquant)', {
        accountId,
        error: err instanceof Error ? err.name : 'unknown',
      })
      return 'failed'
    }
  }

  /**
   * #4078 — la date de collecte du segment (`SEGMENT_CAPABILITY_EPOCH.dossier_blocks`) :
   * l'étape a lu ce dossier jusqu'au bout. L'écran et le rattrapage la comparent à la
   * capacité, jamais à la présence d'une clé (un dossier sans matière n'en porte
   * aucune, à juste titre).
   */
  private async stampCollectedAt(accountId: string, workspaceId: string): Promise<void> {
    await this.dataSource.query(STAMP_COLLECTED_AT, [this.clock(), accountId, workspaceId])
  }

  /**
   * Les blocs 01/14/15 — un échec du modèle les laisse absents, sans toucher aux blocs
   * calculés, et rend `null` (≠ `{}`, « rien à lire ») pour que le segment reste non daté.
   */
  private async synthesize(
    accountId: string,
    accountName: string,
    raw: Record<string, unknown>,
    keys: readonly (typeof SYNTHESIS_BLOCK_KEYS)[number][],
  ): Promise<Record<string, unknown[]> | null> {
    const dossier: Record<string, unknown> = {}
    for (const key of SYNTHESIS_INPUT_KEYS) {
      if (raw[key] != null) dossier[key] = raw[key]
    }
    // Rien de collecté : rien à lire, rien à payer.
    if (Object.keys(dossier).length === 0) return {}
    try {
      const result = await this.ia.dossierBlocks({ accountName, dossier })
      await addCostToLatestAnalysisRun(this.dataSource, this.logger, accountId, result.costUsd)
      return Object.fromEntries(keys.map(key => [key, sanitizeSynthesisNotes(result.blocks[key])]))
    } catch (err) {
      this.logger.warn('Blocs de lecture du dossier non produits (non bloquant)', {
        accountId,
        error: err instanceof Error ? err.name : 'unknown',
      })
      return null
    }
  }
}
