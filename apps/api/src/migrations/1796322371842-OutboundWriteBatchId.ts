import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2854 (#2201.9) — LA FUSION D'ACTIONS EN MASSE, FONDATION.
 *
 * Trois lots indépendants (25-26/09) ont vérifié la même absence : `bulk_send`/
 * `bulk_update`/`bulk_delete` classent déjà des familles de permission
 * (`sensitiveActionFamilySchema`), mais aucun endpoint ne REGROUPE plusieurs
 * écritures en une seule demande — la file unique (#2201) fusionne les
 * NATURES d'écriture, jamais les ACTIONS EN MASSE elles-mêmes (le 9ᵉ point de
 * l'énoncé d'origine).
 *
 * `batch_id` est la fondation minimale : ADDITIVE, NULLABLE, jamais NOT NULL —
 * une demande déposée seule (le cas de toutes les lignes déjà en base) n'a
 * jamais fait partie d'un lot, et ce n'est pas une valeur à deviner. Un lot est
 * un ENSEMBLE de demandes qui partagent le même `batch_id`, posé par
 * `OutboundWriteService.requestBatch()` — pas un objet séparé : la porte
 * d'écriture reste `request()`, LA MÊME pour un envoi seul ou groupé (GA-26).
 */
export class OutboundWriteBatchId1796322371842 implements MigrationInterface {
  name = 'OutboundWriteBatchId1796322371842'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outbound_write_requests ADD COLUMN IF NOT EXISTS batch_id uuid;
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS outbound_write_requests_batch_id_idx
        ON outbound_write_requests (workspace_id, batch_id) WHERE batch_id IS NOT NULL;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS outbound_write_requests_batch_id_idx;`)
    await queryRunner.query(`ALTER TABLE outbound_write_requests DROP COLUMN IF EXISTS batch_id;`)
  }
}
