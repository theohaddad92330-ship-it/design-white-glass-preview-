import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * R10C-FIX (14/10) — `match_dataforge_rag_chunks` en délai dépassé (`57014 statement timeout`, prod 14/10 ~19h45).
 *
 * Cause : la définition de `1796431312847-MatchChunksFilterTypeChunk` met `1 - (embedding <=> q) > threshold`
 * dans le WHERE, avec un `OR` de sauvegarde : l'index vectoriel n'est pas utilisable, scan séquentiel.
 *
 * Forme compatible index : une sous-requête filtre par compte / type / archived_at et ordonne par distance
 * (`ORDER BY c.embedding <=> query_embedding LIMIT GREATEST(match_count * 4, 32)`), puis le seuil et le
 * `LIMIT match_count` s'appliquent à l'extérieur. MÊME signature, MÊMES colonnes ; les clauses de sauvegarde
 * (compte NULL, GARDE_FOU_QUALITE, archived_at) sont recopiées MOT POUR MOT.
 *
 * Index : aucun index vectoriel n'existait sur `dataforge_rag_chunks.embedding` (`1791510000000-OrionV12Staging`
 * l'écartait à 3 849 lignes ; le corpus Drive a depuis grossi) → HNSW cosinus, sans phase d'entraînement.
 * L'index btree sur `account_id` existe déjà (`dataforge_rag_chunks_account_idx`).
 *
 * `down()` restaure la définition de `1796431312847` mot pour mot et retire l'index HNSW.
 */
export class MatchChunksIndexFriendly1796541384532 implements MigrationInterface {
  public name = 'MatchChunksIndexFriendly1796541384532'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS dataforge_rag_chunks_embedding_hnsw_idx ON dataforge_rag_chunks USING hnsw (embedding extensions.vector_cosine_ops)`,
    )
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION match_dataforge_rag_chunks(
        query_embedding extensions.vector(1536),
        match_threshold float DEFAULT 0.5,
        match_count int DEFAULT 8,
        filter_account_id text DEFAULT NULL,
        filter_type_chunk text DEFAULT NULL
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
          n.id,
          n.chunk_id,
          n.account_id,
          n.entreprise,
          n.type_chunk,
          n.titre,
          n.texte,
          n.source,
          n.niveau_confiance,
          n.priorite_indexation,
          n.similarity
        FROM (
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
            1 - (c.embedding <=> query_embedding) AS similarity,
            c.embedding <=> query_embedding AS distance
          FROM dataforge_rag_chunks c
          WHERE
            c.embedding IS NOT NULL
            -- #3586 : un chunk archivé (fichier Drive modifié, supprimé ou sorti du dossier) n'est plus servi.
            AND c.archived_at IS NULL
            AND (
              filter_account_id IS NULL
              OR c.account_id = filter_account_id
              -- Alerte/référentiel global : jamais exclu par un filtre compte.
              OR c.account_id IS NULL
              -- Ceinture ET bretelles : même si un futur garde-fou portait un account_id.
              OR c.type_chunk = 'GARDE_FOU_QUALITE'
            )
            -- #3586 W3 : filtre de type optionnel, AND séparé (NULL ⇒ aucun effet).
            AND (filter_type_chunk IS NULL OR c.type_chunk = filter_type_chunk)
          ORDER BY c.embedding <=> query_embedding
          LIMIT GREATEST(match_count * 4, 32)
        ) n
        WHERE n.similarity > match_threshold
        ORDER BY
          (n.priorite_indexation = 0) DESC,
          n.distance
        LIMIT match_count;
      END;
      $$
    `)
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION match_dataforge_rag_chunks TO authenticated`)
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION match_dataforge_rag_chunks TO service_role`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION match_dataforge_rag_chunks(
        query_embedding extensions.vector(1536),
        match_threshold float DEFAULT 0.5,
        match_count int DEFAULT 8,
        filter_account_id text DEFAULT NULL,
        filter_type_chunk text DEFAULT NULL
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
          -- #3586 : un chunk archivé (fichier Drive modifié, supprimé ou sorti du dossier) n'est plus servi.
          AND c.archived_at IS NULL
          AND (
            filter_account_id IS NULL
            OR c.account_id = filter_account_id
            -- Alerte/référentiel global : jamais exclu par un filtre compte.
            OR c.account_id IS NULL
            -- Ceinture ET bretelles : même si un futur garde-fou portait un account_id.
            OR c.type_chunk = 'GARDE_FOU_QUALITE'
          )
          -- #3586 W3 : filtre de type optionnel, AND séparé (NULL ⇒ aucun effet).
          AND (filter_type_chunk IS NULL OR c.type_chunk = filter_type_chunk)
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
    await queryRunner.query(`DROP INDEX IF EXISTS dataforge_rag_chunks_embedding_hnsw_idx`)
  }
}
