import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2317.12 (épopée #2923) — une action du plan peut être « Marquée obsolète ».
 *
 * L'épopée #2317 (ACCOUNT PLAN ET ACTION OS CANONIQUE) demande qu'un
 * changement de poste, de scope ou de besoin MARQUE les actions concernées
 * plutôt que de les supprimer silencieusement (« on archive, on ne supprime
 * pas »). Rien ne portait ce statut : `execution_status` ne connaissait que
 * `todo` / `done` / `snoozed` / `prepared`.
 *
 * La contrainte est élargie AVANT le code qui écrit la valeur (GA-11 / GA-12),
 * en ajout seulement et en FIN de liste (GA-08) : aucune ligne existante ne
 * change de sens, aucune ne devient invalide.
 */
export class ActionObsoleteStatus1796321999947 implements MigrationInterface {
  public name = 'ActionObsoleteStatus1796321999947'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE action_plan_items DROP CONSTRAINT IF EXISTS action_plan_items_execution_status_check`,
    )
    await queryRunner.query(
      `ALTER TABLE action_plan_items ADD CONSTRAINT action_plan_items_execution_status_check
         CHECK (execution_status IN ('todo', 'done', 'snoozed', 'prepared', 'obsolete'))`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
