import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * RPC function for pgvector cosine similarity search on `rag_documents`.
 * Used by the RAG service as soon as `EMBEDDING_API_KEY` is set (zero-flag).
 */
export class RagVectorSearch1767398400000 implements MigrationInterface {
  public name = 'RagVectorSearch1767398400000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION match_rag_documents(
        query_embedding vector(1536),
        match_threshold float DEFAULT 0.7,
        match_count int DEFAULT 5,
        filter_user_id uuid DEFAULT NULL
      )
      RETURNS TABLE (
        id uuid,
        title text,
        content text,
        category text,
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
          1 - (rd.embedding <=> query_embedding) AS similarity
        FROM rag_documents rd
        WHERE
          (filter_user_id IS NULL OR rd.user_id = filter_user_id)
          AND rd.embedding IS NOT NULL
          AND 1 - (rd.embedding <=> query_embedding) > match_threshold
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
