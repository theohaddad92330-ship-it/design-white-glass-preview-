import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2914 (#2128.11) — « partager une section » du dossier plutôt que le
 * dossier entier. Additive et jamais NULL : un lien déjà émis portait le
 * dossier ENTIER, ce que `'full'` continue de dire pour lui sans qu'aucune
 * ligne n'ait besoin d'être réécrite.
 */
export class AccountShareSection1796321998933 implements MigrationInterface {
  public name = 'AccountShareSection1796321998933'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE account_shares ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'full';
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
