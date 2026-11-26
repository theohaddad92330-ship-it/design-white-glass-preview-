import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * L'exclusion d'un contact (PDF 2, items 82-83 — décision de Louis du 21/08).
 *
 * L'état `rejete` existait dans l'énumération du cycle de vie depuis des mois,
 * et son drapeau n'était JAMAIS posé : aucune colonne ne le portait, aucun
 * endpoint ne l'écrivait. Un état déclaré que rien ne produit ressemble en tout
 * point à un état qui marche.
 *
 * Deux colonnes, pas une : la date DIT quand, le motif dit pourquoi. Un motif
 * sans date ne se trie pas, une date sans motif ne s'explique pas six mois plus
 * tard — et c'est six mois plus tard qu'on se demande pourquoi ce contact a
 * disparu des listes.
 */
export class ContactExclusion1789900000001 implements MigrationInterface {
  name = 'ContactExclusion1789900000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS excluded_at timestamptz`)
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS exclusion_reason text`)
    // Les listes filtrent sur « non exclu » à chaque lecture : sans index
    // partiel, chaque écran de contacts scanne la table entière pour écarter
    // une poignée de lignes.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_contacts_excluded ON contacts (account_id) WHERE excluded_at IS NOT NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_contacts_excluded`)
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS exclusion_reason`)
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS excluded_at`)
  }
}
