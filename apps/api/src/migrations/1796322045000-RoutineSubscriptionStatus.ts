import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `routine_subscriptions.status` — LES SIX STATUTS (#2398.7, épopée #2843).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `enabled` (`boolean`) ne portait que deux états depuis la création de la
 * table (`Routines1788800000002`). Le cahier des charges (LAU-FINAL-112,
 * #2398.6/.7) en nomme six : `draft`/`active`/`paused`/`disabled`/`error`/
 * `deprecated`. Cinq vérifications indépendantes (24-26/09) ont classé le
 * changement de modèle « plusieurs jours » à cause du risque sur les lecteurs
 * existants de `enabled` (`routine-schedule.ts`, `laura-probe.service.ts`,
 * `quality-metrics.service.ts`) et l'idempotence du scheduler.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CONTRAINTE S'ÉLARGIT AVANT LE CODE (GA-11/GA-12)
 * ─────────────────────────────────────────────────────────────────────────────
 * `status` est une colonne NEUVE, contrainte à exactement ces six valeurs dès
 * sa création — jamais un TEXT libre qu'un futur appelant pourrait remplir de
 * n'importe quoi. `enabled` n'est PAS supprimée : `RoutinesService` la
 * maintient en MIROIR (`enabled = status === 'active'`) à chaque écriture, ce
 * qui laisse les trois lecteurs existants inchangés pendant que `status`
 * devient la vérité (GA-26 : un réglage, une source — les deux colonnes ne
 * portent plus qu'une seule décision, jamais deux indépendantes).
 *
 * Backfill : `active` si `enabled` était vrai, `paused` sinon — le même
 * comportement qu'avant cette migration, au bit près.
 */
export class RoutineSubscriptionStatus1796322045000 implements MigrationInterface {
  public name = 'RoutineSubscriptionStatus1796322045000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE routine_subscriptions
        ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    `)
    await queryRunner.query(`
      UPDATE routine_subscriptions
        SET status = CASE WHEN enabled THEN 'active' ELSE 'paused' END
    `)
    await queryRunner.query(`
      ALTER TABLE routine_subscriptions
        ADD CONSTRAINT routine_subscriptions_status_check
        CHECK (status IN ('draft', 'active', 'paused', 'disabled', 'error', 'deprecated'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE routine_subscriptions DROP CONSTRAINT IF EXISTS routine_subscriptions_status_check`,
    )
    await queryRunner.query(`ALTER TABLE routine_subscriptions DROP COLUMN IF EXISTS status`)
  }
}
