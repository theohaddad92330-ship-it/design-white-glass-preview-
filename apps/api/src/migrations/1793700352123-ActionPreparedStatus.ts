import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2123.37 — une action du plan peut être « Préparée ».
 *
 * Recette du 15/09 : le statut existait au copilote et aux routines, jamais
 * pour une action du plan — le commercial qui a écrit son message sans l'envoyer
 * n'avait que « à faire » ou « fait », deux mensonges.
 *
 * La contrainte est élargie AVANT le code qui écrit la valeur (GA-11 / GA-12),
 * en ajout seulement et en FIN de liste (GA-08) : aucune ligne existante ne
 * change de sens, aucune ne devient invalide.
 *
 * « Exécutée » (#2123.41) n'est PAS une valeur de plus : c'est le libellé de
 * `done`. Deux valeurs pour le même état couperaient en deux le compte des
 * actions faites, et « Mes relances » en oublierait la moitié.
 */
export class ActionPreparedStatus1793700352123 implements MigrationInterface {
  public name = 'ActionPreparedStatus1793700352123'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE action_plan_items DROP CONSTRAINT IF EXISTS action_plan_items_execution_status_check`,
    )
    await queryRunner.query(
      `ALTER TABLE action_plan_items ADD CONSTRAINT action_plan_items_execution_status_check
         CHECK (execution_status IN ('todo', 'done', 'snoozed', 'prepared'))`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
