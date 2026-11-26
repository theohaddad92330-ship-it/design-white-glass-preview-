import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Recherche pgvector sur `dataforge_rag_chunks` — même mécanique que
 * `match_rag_documents` (`1767398400000-RagVectorSearch.ts`), avec UNE
 * différence structurelle qui porte l'avertissement 1 de la tâche :
 *
 * ⚠️ **Un chunk `GARDE_FOU_QUALITE` (ou tout chunk `account_id IS NULL`,
 * référentiel/gatekeeper compris) N'EST JAMAIS exclu par `filter_account_id`.**
 * Sans cette clause, une recherche scopée à un compte (« que sait-on
 * d'Enedis ? ») ne remonterait QUE les chunks `account_id = 'Enedis'`, et les
 * 20 alertes qualité globales — dont AN-001 « corrections non propagées »,
 * précisément à propos d'Enedis — resteraient invisibles. Ce n'est pas une
 * question de seuil de similarité : c'est une exclusion STRUCTURELLE que le
 * SQL empêche, avant même de calculer une distance.
 *
 * `priorite_indexation = 0` (preuve sourcée + garde-fou qualité, 235 lignes
 * mesurées) reçoit un boost de reranking — trié AVANT la distance cosinus,
 * jamais à sa place : c'est un ordre de priorité, pas un score qui s'additionne.
 *
 * Pas de recherche plein texte de repli ici (contrairement à `HybridSearch`
 * côté `rag_documents`) : `OrionRagChunksService` (Python) garde cette
 * responsabilité, avec la MÊME politique zéro-clé que le reste du RAG —
 * `EMBEDDING_API_KEY` absente ⇒ cette fonction n'est jamais appelée.
 */
export class OrionRagChunksVectorSearch1791510100000 implements MigrationInterface {
  public name = 'OrionRagChunksVectorSearch1791510100000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION match_dataforge_rag_chunks(
        query_embedding extensions.vector(1536),
        match_threshold float DEFAULT 0.5,
        match_count int DEFAULT 8,
        filter_account_id text DEFAULT NULL
      )
      RETURNS TABLE (
        id uuid,
        chunk_id text,
        account_id text,
        entreprise text,
        type_chunk text,
        titre text,
        texte text,
        source text,
        niveau_confiance text,
        priorite_indexation smallint,
        similarity float
      )
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RETURN QUERY
        SELECT
          c.id,
          c.chunk_id,
          c.account_id,
          c.entreprise,
          c.type_chunk,
          c.titre,
          c.texte,
          c.source,
          c.niveau_confiance,
          c.priorite_indexation,
          1 - (c.embedding <=> query_embedding) AS similarity
        FROM dataforge_rag_chunks c
        WHERE
          c.embedding IS NOT NULL
          AND (
            filter_account_id IS NULL
            OR c.account_id = filter_account_id
            -- Alerte/référentiel global : jamais exclu par un filtre compte.
            OR c.account_id IS NULL
            -- Ceinture ET bretelles : même si un futur garde-fou portait un account_id.
            OR c.type_chunk = 'GARDE_FOU_QUALITE'
          )
          AND 1 - (c.embedding <=> query_embedding) > match_threshold
        ORDER BY
          (c.priorite_indexation = 0) DESC,
          c.embedding <=> query_embedding
        LIMIT match_count;
      END;
      $$
    `)

    await queryRunner.query(`GRANT EXECUTE ON FUNCTION match_dataforge_rag_chunks TO authenticated`)
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION match_dataforge_rag_chunks TO service_role`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
