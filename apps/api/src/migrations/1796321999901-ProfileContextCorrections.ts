import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2908 (#2010.4) — l'état « corrigé » éditable, champ par champ, du contexte
 * commercial généré. `profile_context` est réécrit EN ENTIER à chaque
 * régénération (#2009) : une correction posée dedans serait effacée par la
 * prochaine génération. Colonne SÉPARÉE, jamais réécrite par une
 * régénération — même précédent que `audit_move_decisions` (#2074.16).
 *
 * Additive et nullable : `NULL`/`{}` tant qu'aucune correction n'a été
 * posée, comportement d'avant inchangé.
 */
export class ProfileContextCorrections1796321999901 implements MigrationInterface {
  public name = 'ProfileContextCorrections1796321999901'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_context_corrections jsonb;
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
