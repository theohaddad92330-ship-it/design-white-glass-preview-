import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2843 (#2205.45) — LE PLAFOND DE DESTINATAIRES, distinct de la cible
 * calculée.
 *
 * `no_reply_follow_up` prépare aujourd'hui UN brouillon par passage, un
 * entier littéral dans `RoutineExecutors.noReplyFollowUp`. Colonne ADDITIVE,
 * NULLABLE sans défaut : `NULL` est la valeur VRAIE pour chaque ligne
 * existante (« aucun plafond réglé »), pas une valeur de remplissage — un
 * `DEFAULT 1` aurait fait mentir une ligne qui n'a jamais vu ce réglage.
 * L'exécuteur retombe sur `1` (comportement d'avant ce lot) quand la colonne
 * est `NULL`, voir `RoutineExecutors.noReplyFollowUp`.
 */
export class RoutineSubscriptionMaxItemsPerRun1796402081234 implements MigrationInterface {
  name = 'RoutineSubscriptionMaxItemsPerRun1796402081234'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE routine_subscriptions ADD COLUMN IF NOT EXISTS max_items_per_run integer NULL;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE routine_subscriptions DROP COLUMN IF EXISTS max_items_per_run;
    `)
  }
}
