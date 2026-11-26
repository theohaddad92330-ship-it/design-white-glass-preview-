import type { EntityManager } from 'typeorm'
import {
  MARKET_PATTERN_WINDOW_DAYS,
  SHARED_SIGNAL_DEAL_WINDOW_DAYS,
  type OutcomeRecommendationDimension,
  type SharedScope,
} from '@bellum/contracts'
import {
  actionOutcomeCells,
  caseOutcomeCells,
  marketPatternCells,
  messageLearningCells,
  signalDealCells,
  type ActionOutcomeSourceRow,
  type CaseOutcomeSourceRow,
  type MarketPatternSourceRow,
  type MessageLearningSourceRow,
  type SignalDealSourceRow,
} from './shared-base-cells'

/**
 * P05 (#3246, lot 09/10) — LES ÉCRITURES de la base anonyme commune.
 *
 * Elles reçoivent des comptages PAR ESPACE et mutualisent ELLES-MÊMES
 * (`actionOutcomeCells` → `poolSharedCells`) : aucun appelant — le job
 * nocturne, le semis de démonstration — ne peut écrire une cellule qui n'a
 * pas franchi le seuil des trois espaces (GA-43). Le périmètre est RÉÉCRIT,
 * jamais complété : un second passage produit les mêmes lignes.
 *
 * Fichier sans `service` dans son nom, et c'est voulu : `DemoSeedService`
 * l'importe sans aller chercher un service voisin (GA-07).
 */

type Manager = Pick<EntityManager, 'query'>

export async function rewriteActionOutcomeCells(
  manager: Manager,
  scope: SharedScope,
  rowsByDimension: ReadonlyArray<{
    dimension: OutcomeRecommendationDimension
    rows: readonly ActionOutcomeSourceRow[]
  }>,
): Promise<number> {
  await manager.query(`DELETE FROM shared_action_outcome_aggregates WHERE scope = $1`, [scope])
  let written = 0
  for (const { dimension, rows } of rowsByDimension) {
    for (const cell of actionOutcomeCells(rows)) {
      await manager.query(
        `INSERT INTO shared_action_outcome_aggregates
           (scope, dimension, value, sector_key, size_band, positive, judged, contributing_workspaces, computed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (scope, dimension, value, sector_key, size_band) DO UPDATE
           SET positive = EXCLUDED.positive, judged = EXCLUDED.judged,
               contributing_workspaces = EXCLUDED.contributing_workspaces, computed_at = now()`,
        [
          scope,
          dimension,
          cell.value,
          cell.sectorKey,
          cell.sizeBand,
          cell.positive,
          cell.judged,
          cell.contributingWorkspaces,
        ],
      )
      written += 1
    }
  }
  return written
}

/** P05.b — les cas gagnés / perdus, mutualisés par secteur, taille, position de groupe. */
export async function rewriteCaseOutcomeCells(
  manager: Manager,
  scope: SharedScope,
  rows: readonly CaseOutcomeSourceRow[],
): Promise<number> {
  await manager.query(`DELETE FROM shared_case_outcome_aggregates WHERE scope = $1`, [scope])
  const cells = caseOutcomeCells(rows)
  for (const cell of cells) {
    await manager.query(
      `INSERT INTO shared_case_outcome_aggregates
         (scope, dimension, value, won, lost, contributing_workspaces, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (scope, dimension, value) DO UPDATE
         SET won = EXCLUDED.won, lost = EXCLUDED.lost,
             contributing_workspaces = EXCLUDED.contributing_workspaces, computed_at = now()`,
      [scope, cell.dimension, cell.value, cell.won, cell.lost, cell.contributingWorkspaces],
    )
  }
  return cells.length
}

/**
 * #2877 (#2385.5 GLOBAL, Louis 11/10/2026) — les signaux d'apprentissage des
 * messages, mutualisés par signal. Des comptes, jamais un corps de message.
 */
export async function rewriteMessageLearningCells(
  manager: Manager,
  scope: SharedScope,
  rows: readonly MessageLearningSourceRow[],
): Promise<number> {
  await manager.query(`DELETE FROM shared_message_learning_aggregates WHERE scope = $1`, [scope])
  const cells = messageLearningCells(rows)
  for (const cell of cells) {
    await manager.query(
      `INSERT INTO shared_message_learning_aggregates (scope, signal, count, contributing_workspaces, computed_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (scope, signal) DO UPDATE
         SET count = EXCLUDED.count, contributing_workspaces = EXCLUDED.contributing_workspaces, computed_at = now()`,
      [scope, cell.signal, cell.count, cell.contributingWorkspaces],
    )
  }
  return cells.length
}

/** P05.c — un type de signal suivi d'une affaire ouverte, par secteur et au total. */
export async function rewriteSignalDealCells(
  manager: Manager,
  scope: SharedScope,
  rows: readonly SignalDealSourceRow[],
): Promise<number> {
  await manager.query(`DELETE FROM shared_signal_deal_aggregates WHERE scope = $1`, [scope])
  const cells = signalDealCells(rows)
  for (const cell of cells) {
    await manager.query(
      `INSERT INTO shared_signal_deal_aggregates
         (scope, signal_type, sector_key, signals, followed_by_deal, window_days, contributing_workspaces, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (scope, signal_type, sector_key) DO UPDATE
         SET signals = EXCLUDED.signals, followed_by_deal = EXCLUDED.followed_by_deal,
             window_days = EXCLUDED.window_days,
             contributing_workspaces = EXCLUDED.contributing_workspaces, computed_at = now()`,
      [
        scope,
        cell.signalType,
        cell.sectorKey,
        cell.signals,
        cell.followedByDeal,
        SHARED_SIGNAL_DEAL_WINDOW_DAYS,
        cell.contributingWorkspaces,
      ],
    )
  }
  return cells.length
}

/**
 * #4286.15.c (Louis 22/10/2026) — les tendances de marché entre espaces. Mutualise ELLE-MÊME
 * (`marketPatternCells` → `poolSharedCells`) : aucun appelant ne peut écrire une cellule sous trois
 * espaces. Le périmètre est RÉÉCRIT, jamais complété.
 */
export async function rewriteMarketPatternCells(
  manager: Manager,
  scope: SharedScope,
  rows: readonly MarketPatternSourceRow[],
): Promise<number> {
  await manager.query(`DELETE FROM shared_market_pattern_aggregates WHERE scope = $1`, [scope])
  const cells = marketPatternCells(rows)
  for (const cell of cells) {
    await manager.query(
      `INSERT INTO shared_market_pattern_aggregates
         (scope, topic, sector_key, size_band, region_key, observations, window_days, contributing_workspaces, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (scope, topic, sector_key, size_band, region_key) DO UPDATE
         SET observations = EXCLUDED.observations, window_days = EXCLUDED.window_days,
             contributing_workspaces = EXCLUDED.contributing_workspaces, computed_at = now()`,
      [
        scope,
        cell.topic,
        cell.sectorKey,
        cell.sizeBand,
        cell.regionKey,
        cell.observations,
        MARKET_PATTERN_WINDOW_DAYS,
        cell.contributingWorkspaces,
      ],
    )
  }
  return cells.length
}
