import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3219 (#190.2) — `scope_difference` : « 12 dans l'équipe Data » et « 500 au
 * total » ne se contredisent pas, chacun est vrai dans sa portée. Le journal
 * ne la portait pas.
 *
 * NULLABLE, additive, sans contrainte : la portée est DÉCLARÉE par l'écrivain
 * (`FieldChange.scope`), jamais devinée ; tout l'historique et tout écrivain
 * qui ne la déclare pas gardent `NULL` (= non déclarée), et le détecteur ne
 * déduit alors rien. La colonne existe AVANT le code qui l'écrit.
 */
export class RecordFieldAuditScope1796424537419 implements MigrationInterface {
  public name = 'RecordFieldAuditScope1796424537419'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE record_field_audit ADD COLUMN IF NOT EXISTS scope text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE record_field_audit DROP COLUMN IF EXISTS scope`)
  }
}
