import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2779 — les trois portées manquantes d'un document RAG (#1954 : « Mon espace
 * personnel », « Un compte précis », « Base de connaissance durable »).
 *
 * GA-11/GA-12 — la contrainte est élargie AVANT le code qui écrit ces valeurs.
 * Énumération TypeScript miroir : `RAG_DOCUMENT_SCOPES`
 * (`packages/contracts/src/schemas/rag.ts`), miroir Python dans
 * `apps/ia/app/services/rag_service.py`.
 *
 * CE QUE CETTE MIGRATION FAIT — ADDITIF, AUCUN CHANGEMENT DE VISIBILITÉ RÉTROACTIF
 *  1. `account_id uuid` — le compte visé quand `scope = 'account'`, sinon NULL.
 *     Sans clé étrangère, comme `conversation_id` : un compte ARCHIVÉ garde ses
 *     documents (on archive, on ne supprime pas), et la récupération filtre de
 *     toute façon sur l'égalité exacte avec le compte de la requête.
 *  2. `rag_documents_scope_check` élargie aux cinq portées.
 *  3. `rag_documents_account_scope_requires_id_check` — un document `account`
 *     sans compte n'a personne à qui appartenir.
 *  4. `match_rag_documents` — un paramètre de plus (`filter_account_id`), donc
 *     la signature CHANGE : l'ancienne est retirée d'abord (sinon deux
 *     surcharges coexistent et l'appel devient ambigu). Le prédicat de
 *     portée devient :
 *       · `workspace` / `knowledge_base` : toute l'équipe (comme avant) ;
 *       · `personal` : son AUTEUR seulement ;
 *       · `account` : SEULEMENT une requête qui porte CE compte — sans compte
 *         (recherche générale) ou sur un autre compte, jamais ;
 *       · `conversation` : jamais ici (seul `fetch_documents_by_ids` le lit).
 *     Le repli plein texte applique le MÊME prédicat côté service
 *     (`_scope_retrieval`) — jamais un seul des deux moteurs scopé.
 *
 * Idempotent. `down` non supporté (convention du dépôt).
 */
export class RagDocumentAccountScope1796001543888 implements MigrationInterface {
  public name = 'RagDocumentAccountScope1796001543888'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS account_id uuid`)

    await queryRunner.query(`ALTER TABLE rag_documents DROP CONSTRAINT IF EXISTS rag_documents_scope_check`)
    await queryRunner.query(`
      ALTER TABLE rag_documents
        ADD CONSTRAINT rag_documents_scope_check
        CHECK (scope IN ('workspace', 'conversation', 'personal', 'account', 'knowledge_base'))
    `)

    await queryRunner.query(
      `ALTER TABLE rag_documents DROP CONSTRAINT IF EXISTS rag_documents_account_scope_requires_id_check`,
    )
    await queryRunner.query(`
      ALTER TABLE rag_documents
        ADD CONSTRAINT rag_documents_account_scope_requires_id_check
        CHECK (scope <> 'account' OR account_id IS NOT NULL)
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_rag_documents_account_id
        ON rag_documents (account_id)
        WHERE account_id IS NOT NULL
    `)

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS match_rag_documents(extensions.vector, float, int, uuid, uuid)
    `)
    await queryRunner.query(`DROP FUNCTION IF EXISTS match_rag_documents(vector, float, int, uuid, uuid)`)

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION match_rag_documents(
        query_embedding vector(1536),
        match_threshold float DEFAULT 0.7,
        match_count int DEFAULT 5,
        filter_user_id uuid DEFAULT NULL,
        filter_workspace_id uuid DEFAULT NULL,
        filter_account_id uuid DEFAULT NULL
      )
      RETURNS TABLE (
        id uuid,
        title text,
        content text,
        category text,
        created_at timestamptz,
        similarity float
      )
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RETURN QUERY
        SELECT
          rd.id,
          rd.title,
          rd.content,
          rd.category,
          rd.created_at,
          1 - (rd.embedding <=> query_embedding) AS similarity
        FROM rag_documents rd
        WHERE
          rd.embedding IS NOT NULL
          -- #2779 : qui peut lire quoi (jamais un document de fil ici).
          AND (
            rd.scope IN ('workspace', 'knowledge_base')
            OR (rd.scope = 'personal' AND rd.user_id = filter_user_id)
            OR (rd.scope = 'account' AND filter_account_id IS NOT NULL AND rd.account_id = filter_account_id)
          )
          AND 1 - (rd.embedding <=> query_embedding) > match_threshold
          AND (
            CASE
              WHEN filter_workspace_id IS NOT NULL THEN
                rd.workspace_id = filter_workspace_id
                OR (rd.workspace_id IS NULL AND rd.user_id = filter_user_id)
              WHEN filter_user_id IS NOT NULL THEN
                rd.user_id = filter_user_id
              ELSE FALSE
            END
          )
        ORDER BY rd.embedding <=> query_embedding
        LIMIT match_count;
      END;
      $$
    `)

    await queryRunner.query(`GRANT EXECUTE ON FUNCTION match_rag_documents TO authenticated`)
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION match_rag_documents TO service_role`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
