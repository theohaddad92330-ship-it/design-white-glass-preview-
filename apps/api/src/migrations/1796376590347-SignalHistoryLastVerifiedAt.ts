import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3206.2 (partiel, épopée #3240) — la plus petite tranche PROUVABLE du champ
 * de vérification que #3206 nomme : un événement de vérification n'existait
 * nulle part dans le pipeline (voir la note laissée par la migration
 * `1788241729466`, « CURRENT_VERIFIED suppose last_verified_at qu'aucun
 * pipeline n'écrit aujourd'hui »).
 *
 * `last_verified_at`, NULLABLE, posée par le SERVEUR au moment où un
 * commercial clique « Marquer ce signal comme vérifié » depuis la Veille
 * (`SignalHistoryService.verifySignal`, `POST /signal-history/verify`) — jamais
 * déduite d'une date de signal ni d'une re-détection automatique : une
 * observation n'est pas une vérification (même distinction que
 * `classify_temporal_status` sur l'IA, apps/ia/app/services/signal_freshness.py).
 *
 * Additive + idempotente (`ADD COLUMN IF NOT EXISTS`), même geste que
 * `importance`/`action_id`. Aucun backfill : les lignes existantes restent
 * `NULL` (jamais vérifiées) jusqu'au premier clic.
 */
export class SignalHistoryLastVerifiedAt1796376590347 implements MigrationInterface {
  public name = 'SignalHistoryLastVerifiedAt1796376590347'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE signal_history ADD COLUMN IF NOT EXISTS last_verified_at timestamptz`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
