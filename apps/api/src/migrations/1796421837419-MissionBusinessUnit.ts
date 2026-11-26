import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3413 (« autre BU », lot D2 02/10, décision Louis 02/10 QCM) — UNE MISSION PEUT
 * CHANGER DE BU PROPRIÉTAIRE : un transfert réel vers une autre business unit de
 * NOTRE espace (les BU de l'ESN utilisatrice, jamais les divisions du client).
 *
 * `missions.business_unit_id` est NULLABLE et c'est la borne qui compte : NULL =
 * « la mission suit la BU de son compte » (aucune des missions d'aujourd'hui n'est
 * touchée, aucune ne disparaît d'un écran). Posée par le seul geste de transfert.
 *
 * Aucune table de journal ici : le transfert s'écrit dans `record_field_audit`
 * (append-only, qui/quand/avant/après), le journal que « Historique » de la fiche
 * mission lit déjà — un second journal serait la même information sous deux formes.
 * Aucune colonne à énumération fermée : rien à élargir côté CHECK (GA-11/GA-12).
 */
export class MissionBusinessUnit1796421837419 implements MigrationInterface {
  name = 'MissionBusinessUnit1796421837419'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE missions
        ADD COLUMN IF NOT EXISTS business_unit_id uuid NULL REFERENCES business_units (id)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS missions_business_unit_idx ON missions (workspace_id, business_unit_id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS missions_business_unit_idx`)
    await queryRunner.query(`ALTER TABLE missions DROP COLUMN IF EXISTS business_unit_id`)
  }
}
