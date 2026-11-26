import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4189 — un conflit de synchro CRM se PROPOSE, il ne s'efface pas.
 *
 * `sync_record_events.proposal` porte, par champ en écart, la valeur que Bellum a GARDÉE (correction
 * humaine) et celle que le CRM annonce : `{ "email": { "bellum": "…", "crm": "…" } }`. Ajout seul
 * (nullable) : les journaux déjà écrits restent valides, sans proposition (ils ne font aucune ligne
 * à l'écran — on n'affiche pas ce qu'on n'a pas).
 */
export class SyncConflictProposal1796541600000 implements MigrationInterface {
  public name = 'SyncConflictProposal1796541600000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE sync_record_events ADD COLUMN IF NOT EXISTS proposal jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE sync_record_events DROP COLUMN IF EXISTS proposal`)
  }
}
