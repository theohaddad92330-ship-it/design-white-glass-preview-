import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le message vocal de Laura — ce que la base doit accepter AVANT le code (#1939, 12/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION FAIT, ET RIEN D'AUTRE
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **`storage_objects_domain_check` gagne `chat_voice_message`, EN FIN de
 *     liste.** La liste est reprise de la DERNIÈRE déclaration
 *     (`1790990000001-StorageObjects`) — jamais d'une plus ancienne (GA-11). Sans
 *     cet élargissement, le premier message vocal rangé lèverait une violation
 *     de contrainte : « une valeur qui voyage du code vers la base voit sa
 *     contrainte SQL élargie AVANT le code qui l'écrit » (GA-11, GA-12).
 *  2. **`chat_messages.voice_object_id uuid NULL`** — l'enregistrement rattaché à
 *     un message envoyé à Laura. `NULL` est l'état de TOUT l'existant, et d'un
 *     message tapé : ce n'est pas un trou.
 *     `REFERENCES storage_objects(id) ON DELETE SET NULL` : la purge des 30 jours
 *     emporte le FICHIER, jamais le message — le texte reste lisible, seule la
 *     réécoute disparaît. C'est la convention des deux autres consommateurs du
 *     stockage (`1790990000002-StoredFileLinks`).
 *  3. **un index PARTIEL sur `voice_object_id`.** Pas pour la lecture : pour la
 *     PURGE. `ON DELETE SET NULL` fait chercher, pour chaque objet effacé, les
 *     messages qui le référencent — sans index, chaque ligne purgée (jusqu'à 500
 *     par passage) balaierait `chat_messages` en entier. Partiel parce que la
 *     quasi-totalité des messages sont tapés, et n'ont rien à indexer.
 *
 * ⚠️ AUCUNE durée de conservation n'est écrite ici : `retention_until` est une
 * DATE calculée UNE fois au dépôt (`storedFileRetentionUntil`, 30 jours pour ce
 * domaine), et la purge existante la lit sans connaître aucun domaine.
 *
 * ⚠️ Additive seulement : aucune ligne existante n'est touchée, aucune valeur
 * n'est retirée d'une contrainte.
 */
export class ChatVoiceMessages1792800080000 implements MigrationInterface {
  public name = 'ChatVoiceMessages1792800080000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE storage_objects DROP CONSTRAINT IF EXISTS storage_objects_domain_check`)
    await queryRunner.query(`
      ALTER TABLE storage_objects ADD CONSTRAINT storage_objects_domain_check
        CHECK (domain IN ('expense_receipt', 'need_document', 'chat_voice_message'))
    `)
    await queryRunner.query(`
      ALTER TABLE chat_messages
        ADD COLUMN IF NOT EXISTS voice_object_id uuid
          REFERENCES storage_objects(id) ON DELETE SET NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS chat_messages_voice_object_idx
        ON chat_messages (voice_object_id) WHERE voice_object_id IS NOT NULL
    `)
    await queryRunner.query(`
      COMMENT ON COLUMN chat_messages.voice_object_id IS
        'L''enregistrement d''un message vocal envoye a Laura (#1939), quand il est encore conserve. NULL = message tape, ou enregistrement efface (30 jours, ou effacement du compte). ON DELETE SET NULL : la purge emporte le fichier, jamais le message.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS chat_messages_voice_object_idx`)
    await queryRunner.query(`ALTER TABLE chat_messages DROP COLUMN IF EXISTS voice_object_id`)
    // ⚠️ La contrainte n'est PAS rétrécie : des objets `chat_voice_message` peuvent
    // exister, et un `ADD CONSTRAINT` plus étroit échouerait sur eux. Les effacer
    // pour pouvoir redescendre serait une suppression de données par une
    // migration de retour — le seul geste qu'un `down` ne doit jamais faire.
  }
}
