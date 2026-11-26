import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Give the pgvector RAG search the document's real date.
 *
 * The Copilote's « Contexte utilisé » panel now dates each source, so a 2024
 * playbook no longer looks as fresh as yesterday's signal. That date can only be
 * a REAL one: it comes from `rag_documents.created_at`. The full-text backend
 * already selected the column, but `match_rag_documents` — the path taken as
 * soon as `EMBEDDING_API_KEY` is set, i.e. production — did not return it, so
 * every cited document would have shown up dateless exactly where the feature
 * matters most.
 *
 * Adding an output column changes the function's return type, which
 * `CREATE OR REPLACE` refuses; the signature is unchanged so we drop that exact
 * signature first. Everything else (scope predicate, ordering, grants) is copied
 * verbatim from `1786970000000-RagWorkspaceScope` — this migration adds one
 * column and nothing else.
 */
export class RagMatchCreatedAt1787950000000 implements MigrationInterface {
  name = 'RagMatchCreatedAt1787950000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
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
        filter_workspace_id uuid DEFAULT NULL
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
          AND 1 - (rd.embedding <=> query_embedding) > match_threshold
          AND (
            CASE
              -- Team scope: the workspace's documents, whoever uploaded them, plus
              -- the caller's own legacy rows that predate workspace stamping.
              -- Mirrors the RLS policy rag_documents_workspace_access exactly.
              WHEN filter_workspace_id IS NOT NULL THEN
                rd.workspace_id = filter_workspace_id
                OR (rd.workspace_id IS NULL AND rd.user_id = filter_user_id)
              -- No workspace resolved: legacy per-user scope, unchanged.
              WHEN filter_user_id IS NOT NULL THEN
                rd.user_id = filter_user_id
              -- Fail closed: nothing may be retrieved without a scope.
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
