import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Théo B C6.N2 / M2.N1 — « Valider le brouillon », lié à UNE version.
 *
 * Une version de brouillon (`message_draft_versions`) ne se corrige jamais : modifier le texte ajoute une
 * NOUVELLE ligne, donc une nouvelle relecture. La validation vit dans sa propre ligne d'audit (jamais un
 * UPDATE de la version) et porte l'empreinte du contenu relu. Elle ne déclenche AUCUN envoi : valider
 * n'est pas envoyer, le commercial envoie.
 *
 * Table neuve, aucune contrainte de valeur énumérée : rien à élargir avant le code (GA-11/12).
 * Aucun corps de message n'est copié ici — seulement l'empreinte (sha-256 hexadécimal).
 */
export class MessageDraftValidations1796574800001 implements MigrationInterface {
  public name = 'MessageDraftValidations1796574800001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS message_draft_validations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        version_id uuid NOT NULL REFERENCES message_draft_versions (id) ON DELETE CASCADE,
        content_hash text NOT NULL,
        validated_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT message_draft_validations_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$')
      )
    `)
    // Une version se valide une fois ; la relecture suivante est une autre version.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_message_draft_validations_version
        ON message_draft_validations (version_id)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_message_draft_validations_workspace
        ON message_draft_validations (workspace_id, validated_by, created_at)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
