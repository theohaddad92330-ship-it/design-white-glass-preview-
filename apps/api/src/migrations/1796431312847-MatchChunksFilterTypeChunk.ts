import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3586 (W3) — `match_dataforge_rag_chunks` gagne un filtre de TYPE optionnel : `filter_type_chunk`.
 *
 * Avant, le RPC ne filtrait pas sur le type : les ~3 849 chunks ORION pouvaient surclasser les chunks du Drive
 * interne dans le top-N, et le filtre `DRIVE_INTERNE` appliqué ensuite en Python rendait un bloc VIDE. Le filtre
 * passe côté SQL, AVANT le `LIMIT`.
 *
 * ADDITIF : `filter_type_chunk` NULL (défaut) ⇒ comportement IDENTIQUE à `1796431247953-InternalKnowledgeDriveSync`.
 * Les clauses de sauvegarde (compte NULL, type GARDE_FOU_QUALITE dans le `OR`) et l'exclusion `archived_at` sont
 * recopiées MOT POUR MOT ; le filtre de type est un `AND` séparé, jamais dans le `OR`.
 *
 * L'ancienne surcharge (4 arguments) est SUPPRIMÉE dans la même migration : deux surcharges rendraient l'appel
 * PostgREST (`rpc` par nom + arguments nommés) ambigu.
 */
export class MatchChunksFilterTypeChunk1796431312847 implements MigrationInterface {
  public name = 'MatchChunksFilterTypeChunk1796431312847'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION IF EXISTS match_dataforge_rag_chunks(extensions.vector, float, int, text)`)
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS match_dataforge_rag_chunks(extensions.vector, float, int, text, text)`,
    )
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
          AND c.archived_at IS NULL
          AND (
            filter_account_id IS NULL
            OR c.account_id = filter_account_id
            OR c.account_id IS NULL
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
}
