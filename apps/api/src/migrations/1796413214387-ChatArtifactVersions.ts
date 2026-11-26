import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2429.9 (épopée #2852, lot P07 30/09) — LES VERSIONS D'UN ARTEFACT DE CHAT.
 *
 * Un bloc de réponse de Laura est un fragment immuable du texte du message :
 * c'est la version 1. Chaque modification humaine ajoute UNE LIGNE ici (version
 * 2, 3…) — jamais une réécriture du message, jamais une suppression. La lecture
 * montre la version la plus récente et dit laquelle.
 *
 * AJOUT SEULEMENT : une table neuve, rien d'existant n'est touché, rejouable
 * (`IF NOT EXISTS`). Aucun `CHECK` sur une valeur venue du code : `block` est
 * validé à l'écriture par le schéma `replyBlockSchema` (@bellum/contracts).
 *
 * Clés étrangères : l'espace supprimé emporte ses versions (CASCADE) ; le
 * message supprimé avec son fil (#1120) emporte les siennes (CASCADE) — une
 * version n'a de sens que rattachée à son message. `edited_by` reste NULLABLE :
 * un compte effacé (RGPD art. 17) perd le lien, jamais le contenu.
 */
export class ChatArtifactVersions1796413214387 implements MigrationInterface {
  public name = 'ChatArtifactVersions1796413214387'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_artifact_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        message_id uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
        block_rank integer NOT NULL CHECK (block_rank >= 0),
        version integer NOT NULL CHECK (version >= 2),
        block jsonb NOT NULL,
        edited_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chat_artifact_versions_unique UNIQUE (message_id, block_rank, version)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS chat_artifact_versions_message_idx ON chat_artifact_versions (message_id, block_rank, version DESC)`,
    )
    await queryRunner.query(`ALTER TABLE chat_artifact_versions ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_artifact_versions'
                         AND policyname = 'Users can manage their own artifact versions') THEN
          CREATE POLICY "Users can manage their own artifact versions"
            ON chat_artifact_versions FOR ALL
            USING (auth.uid() = edited_by) WITH CHECK (auth.uid() = edited_by);
        END IF;
      END $$;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS chat_artifact_versions`)
  }
}
