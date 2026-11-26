import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2035.1 — l'effectif du GROUPE, distinct de celui de l'activité interrogée.
 *
 * « 120 consultants » ne dit pas si c'est le total du groupe ou celui de
 * l'activité qu'on audite. Colonne ADDITIVE, NULLABLE comme le reste du
 * Temps 1 : une ESN indépendante laisse ce champ vide, jamais devinée à `0`.
 */
export class EffectifGroupBand1795702847644 implements MigrationInterface {
  name = 'EffectifGroupBand1795702847644'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS consultant_size_group_band text;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS consultant_size_group_band;
    `)
  }
}
