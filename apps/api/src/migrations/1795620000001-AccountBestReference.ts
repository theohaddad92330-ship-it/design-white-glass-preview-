import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2165.13 — « Proches de mes meilleures références » lit une vraie source.
 *
 * Le preset posait avant une tranche d'effectif et un âge FIXES
 * (`250-999`, `3to10`), jamais reliés à une référence réelle — la valeur
 * inventée que la doctrine interdit (« jamais de donnée fictive »). Cette
 * colonne EST la source : un commercial marque le compte-CLIENT qui lui
 * sert de meilleure référence, et le preset en lit le secteur.
 *
 * `boolean NOT NULL DEFAULT false` : aucune ligne existante ne devient une
 * référence par accident, et le défaut est le même pour tous les espaces —
 * pas de backfill à deviner.
 */
export class AccountBestReference1795620000001 implements MigrationInterface {
  public name = 'AccountBestReference1795620000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        ADD COLUMN IF NOT EXISTS is_best_reference boolean NOT NULL DEFAULT false
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        DROP COLUMN IF EXISTS is_best_reference
    `)
  }
}
