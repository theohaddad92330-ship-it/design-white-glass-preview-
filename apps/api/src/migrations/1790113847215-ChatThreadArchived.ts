import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Ranger une conversation de Laura (#1120).
 *
 * « Faudrait pouvoir archiver ou supprimer les conversations. Là j'ai fait un
 * test et ça me le ressort direct alors qu'en vrai je m'en fiche un peu. »
 *
 * La colonne porte sur le MESSAGE et non sur un fil : il n'existe pas de table
 * de fils. Un fil est une clé — `COALESCE(conversation_id, id::text)` — et ses
 * messages sont ses seules lignes. Archiver un fil, c'est donc estampiller ses
 * messages, et c'est la seule façon de le faire sans inventer une table dont
 * `listHistory` devrait ensuite garantir la cohérence à chaque écriture.
 *
 * Nullable, sans défaut : `NULL` = fil actif, c'est-à-dire l'état de tout
 * l'existant et le comportement d'avant à l'octet près.
 */
export class ChatThreadArchived1790113847215 implements MigrationInterface {
  public name = 'ChatThreadArchived1790113847215'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS archived_at timestamptz`)
    // Index PARTIEL : la liste ne lit que les fils actifs, et ils sont
    // l'écrasante majorité. Indexer les archivés ferait grossir l'index pour
    // une lecture qui n'arrive qu'à l'ouverture du tiroir.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_chat_messages_archived ON chat_messages (workspace_id, archived_at) WHERE archived_at IS NOT NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_chat_messages_archived`)
    await queryRunner.query(`ALTER TABLE chat_messages DROP COLUMN IF EXISTS archived_at`)
  }
}
