import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2957 (#2179.2/.35) — les sections de navigation qu'un admin d'espace peut
 * masquer (aujourd'hui, seulement « rfp »).
 *
 * Additive : `text[]` avec un défaut `'{}'` plutôt que `NULLABLE` — la
 * navigation lit ce tableau à chaque montage de la barre latérale, et une
 * colonne toujours présente lui évite de distinguer « pas encore réglé » de
 * « rien masqué », qui se comportent pareil.
 */
export class WorkspaceHiddenSections1796350312161 implements MigrationInterface {
  public name = 'WorkspaceHiddenSections1796350312161'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS hidden_sections text[] NOT NULL DEFAULT '{}';
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
