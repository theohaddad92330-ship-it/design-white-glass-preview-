import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2650.1 (18/09/2026) — le verrou de rafraîchissement PAR AXE, distinct de
 * `*_refreshed_at` (migration `1790040000002`).
 *
 * Mesuré en production le 18/09/2026 : deux clics sur « Rafraîchir → Signaux »
 * à cinquante secondes d'écart ont débité DEUX crédits et rejoué DEUX fois la
 * même phase. La règle anti-double-clic existante (`refreshedTooRecently`, 6 h)
 * lit `signals_refreshed_at`, mais cette colonne n'est écrite qu'APRÈS la
 * phase — pendant qu'elle tourne (≈1 min), un second appel la traverse sans
 * obstacle.
 *
 * ⚠️ `*_refreshed_at` n'a PAS pu porter ce verrou : l'écran l'affiche comme
 * « dernier rafraîchissement » (`AccountFreshness.tsx`, `RefreshOutcomeCard
 * .tsx`, `Search.tsx`) — la poser AU DÉBUT de la phase aurait annoncé un
 * rafraîchissement terminé pendant qu'il tourne encore. D'où une marque
 * DÉDIÉE, jamais lue par l'écran.
 *
 * NULLABLE, `NULL` = axe libre. Écrit par `AnalysisRefreshService
 * .reserveDimension` (CAS Postgres — pas une Map en mémoire, le multi-instance
 * compte), relâché par `releaseDimension` (succès, échec, ou course de crédit
 * perdue). Un verrou plus vieux que `REFRESH_LOCK_TIMEOUT_MS` est traité comme
 * ABANDONNÉ (process planté en plein milieu de la phase) plutôt que de
 * bloquer l'axe indéfiniment.
 */
export class RefreshDimensionLock1789756084245 implements MigrationInterface {
  public name = 'RefreshDimensionLock1789756084245'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS signals_refresh_lock_at timestamptz NULL`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS contacts_refresh_lock_at timestamptz NULL`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS entities_refresh_lock_at timestamptz NULL`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS strategy_refresh_lock_at timestamptz NULL`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
