import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LES DEUX CONSOMMATEURS se branchent sur le stockage (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE RÉFÉRENCE, ET RIEN D'AUTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * `storage_object_id` est tout ce que ces deux tables gagnent. Elles ne
 * recopient ni le chemin, ni la taille, ni le type : ces faits vivent dans
 * `storage_objects` et nulle part ailleurs (GA-26). Recopier la taille aurait
 * été tentant — l'écran l'affiche — et aurait garanti qu'un jour les deux ne
 * disent plus la même chose.
 *
 * ⚠️ `expense_report_attachments` garde ses propres `file_name`, `byte_size` et
 * `retention_until`, et ce n'est PAS une contradiction : ils décrivent une
 * pièce **référencée**, qu'on peut connaître sans l'avoir. Une pièce peut donc
 * exister sans octets (le cas d'avant ce lot, et celui d'une reprise
 * documentaire), et c'est `storage_object_id IS NULL` qui le dit. Quand
 * l'objet existe, c'est LUI qui fait foi — le service lit la jointure.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `ON DELETE SET NULL`, JAMAIS `CASCADE`
 * ─────────────────────────────────────────────────────────────────────────────
 * La routine de purge efface un objet ÉCHU. Si la référence était en `CASCADE`,
 * la purge d'un justificatif de dix ans emporterait la LIGNE de justificatif —
 * donc le fait qu'une pièce a existé, son nom, et sa date. « On archive, on ne
 * supprime pas » : le fichier part à l'échéance, la trace reste, et l'écran
 * retombe alors sur ce qu'il savait déjà faire — dire que la pièce est
 * référencée sans être stockée.
 *
 * `need_documents` n'a pas ces colonnes de repli : un document de besoin
 * DÉPOSÉ après ce lot porte toujours un objet, et un document d'avant n'en a
 * jamais eu. Là aussi, `NULL` est une réponse, pas un trou.
 */
export class StoredFileLinks1790990000002 implements MigrationInterface {
  public name = 'StoredFileLinks1790990000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE expense_report_attachments
        ADD COLUMN IF NOT EXISTS storage_object_id uuid
          REFERENCES storage_objects(id) ON DELETE SET NULL
    `)
    await queryRunner.query(`
      ALTER TABLE need_documents
        ADD COLUMN IF NOT EXISTS storage_object_id uuid
          REFERENCES storage_objects(id) ON DELETE SET NULL
    `)
    // La jointure se fait dans ce sens-là : « ce dossier, quels objets ? ».
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS expense_report_attachments_object_idx
        ON expense_report_attachments (storage_object_id)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS need_documents_object_idx ON need_documents (storage_object_id)
    `)
    await queryRunner.query(`
      COMMENT ON COLUMN expense_report_attachments.storage_object_id IS
        'L''objet range, quand il existe. NULL = piece REFERENCEE sans octets - l''ecran n''offre alors aucun telechargement. ON DELETE SET NULL : la purge de retention emporte le fichier, jamais la trace.'
    `)
    await queryRunner.query(`
      COMMENT ON COLUMN need_documents.storage_object_id IS
        'Le fichier de ce document, quand il existe. NULL = document suivi sans piece jointe (les lignes anterieures au stockage). ON DELETE SET NULL : la purge emporte le fichier, jamais la ligne.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS need_documents_object_idx`)
    await queryRunner.query(`DROP INDEX IF EXISTS expense_report_attachments_object_idx`)
    await queryRunner.query(`ALTER TABLE need_documents DROP COLUMN IF EXISTS storage_object_id`)
    await queryRunner.query(`ALTER TABLE expense_report_attachments DROP COLUMN IF EXISTS storage_object_id`)
  }
}
