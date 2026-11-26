import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3437 / #3438 / #3440 — L'ÉTAPE D'UNE SÉQUENCE DE LA BIBLIOTHÈQUE.
 *
 * Les trois messages d'un même persona (M1, M2, M3) partageaient canal +
 * scénario + persona : la sélection en rendait un au hasard de l'ordre de
 * lecture. Colonne ajoutée AVANT le code qui l'écrit (GA-11/GA-12), avec sa
 * contrainte ; les lignes déjà importées sont rattrapées d'après le préfixe de
 * leur titre (« M2 — … », « M1 — … note d'invitation… »), qui est la seule
 * source de l'étape pour elles — une ligne dont le titre n'en porte pas reste
 * sans étape, jamais devinée.
 */
export class MessageLibraryStep1796426537419 implements MigrationInterface {
  name = 'MessageLibraryStep1796426537419'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE message_library_entries ADD COLUMN IF NOT EXISTS step text`)
    await queryRunner.query(`
      ALTER TABLE message_library_entries
        DROP CONSTRAINT IF EXISTS message_library_entries_step_check
    `)
    await queryRunner.query(`
      ALTER TABLE message_library_entries
        ADD CONSTRAINT message_library_entries_step_check
        CHECK (step IS NULL OR step IN ('invitation', 'M1', 'M2', 'M3'))
    `)
    await queryRunner.query(`
      UPDATE message_library_entries SET step = 'invitation'
       WHERE step IS NULL AND title ~ '^M1 — .* — note d’invitation'
    `)
    await queryRunner.query(`
      UPDATE message_library_entries SET step = substring(title from '^(M[123]) — ')
       WHERE step IS NULL AND title ~ '^M[123] — '
    `)
    await queryRunner.query(`
      COMMENT ON COLUMN message_library_entries.step IS
        'Étape de la séquence : invitation | M1 | M2 | M3. NULL = exemple isolé. Critère de sélection structuré.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE message_library_entries DROP CONSTRAINT IF EXISTS message_library_entries_step_check
    `)
    await queryRunner.query(`ALTER TABLE message_library_entries DROP COLUMN IF EXISTS step`)
  }
}
