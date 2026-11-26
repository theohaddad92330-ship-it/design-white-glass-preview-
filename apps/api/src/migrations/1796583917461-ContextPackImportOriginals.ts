import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4573 — l'ORIGINAL d'un document de contexte se conserve et se relit (règle des CV, #4034 — seau privé + URL signée).
 *
 * Ajout seul sur `context_pack_imports` (#4422.1) : quatre colonnes NULLABLES, sans défaut — aucune ligne existante
 * n'est réécrite. Rien de rétroactif : une ligne d'avant garde `original_status = NULL`, et l'écran DIT qu'elle n'a pas
 * gardé son original (« on n'affiche pas ce qu'on n'a pas ») ; aucun fichier n'est reconstruit.
 *
 * Contraintes posées AVANT le code qui écrit (GA-11/GA-12) : la liste des statuts (`CONTEXT_PACK_ORIGINAL_STATUSES`,
 * `@bellum/contracts`), un chemin seulement pour un original conservé, une taille ≥ 0. Le RLS de la table (lecture par
 * les membres de l'espace) couvre déjà ces colonnes.
 */
export class ContextPackImportOriginals1796583917461 implements MigrationInterface {
  public name = 'ContextPackImportOriginals1796583917461'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE context_pack_imports ADD COLUMN IF NOT EXISTS original_status text`)
    await queryRunner.query(`ALTER TABLE context_pack_imports ADD COLUMN IF NOT EXISTS original_storage_path text`)
    await queryRunner.query(`ALTER TABLE context_pack_imports ADD COLUMN IF NOT EXISTS original_mime_type text`)
    await queryRunner.query(`ALTER TABLE context_pack_imports ADD COLUMN IF NOT EXISTS original_size_bytes integer`)
    await queryRunner.query(
      `ALTER TABLE context_pack_imports DROP CONSTRAINT IF EXISTS context_pack_imports_original_status_check`,
    )
    await queryRunner.query(`
      ALTER TABLE context_pack_imports ADD CONSTRAINT context_pack_imports_original_status_check
        CHECK (original_status IS NULL OR original_status IN ('kept', 'too_big', 'unavailable', 'failed_import', 'erased'))
    `)
    await queryRunner.query(
      `ALTER TABLE context_pack_imports DROP CONSTRAINT IF EXISTS context_pack_imports_original_path_check`,
    )
    await queryRunner.query(`
      ALTER TABLE context_pack_imports ADD CONSTRAINT context_pack_imports_original_path_check
        CHECK (original_storage_path IS NULL OR original_status = 'kept')
    `)
    await queryRunner.query(
      `ALTER TABLE context_pack_imports DROP CONSTRAINT IF EXISTS context_pack_imports_original_size_check`,
    )
    await queryRunner.query(`
      ALTER TABLE context_pack_imports ADD CONSTRAINT context_pack_imports_original_size_check
        CHECK (original_size_bytes IS NULL OR original_size_bytes >= 0)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE context_pack_imports DROP CONSTRAINT IF EXISTS context_pack_imports_original_size_check`,
    )
    await queryRunner.query(
      `ALTER TABLE context_pack_imports DROP CONSTRAINT IF EXISTS context_pack_imports_original_path_check`,
    )
    await queryRunner.query(
      `ALTER TABLE context_pack_imports DROP CONSTRAINT IF EXISTS context_pack_imports_original_status_check`,
    )
    await queryRunner.query(`ALTER TABLE context_pack_imports DROP COLUMN IF EXISTS original_size_bytes`)
    await queryRunner.query(`ALTER TABLE context_pack_imports DROP COLUMN IF EXISTS original_mime_type`)
    await queryRunner.query(`ALTER TABLE context_pack_imports DROP COLUMN IF EXISTS original_storage_path`)
    await queryRunner.query(`ALTER TABLE context_pack_imports DROP COLUMN IF EXISTS original_status`)
  }
}
