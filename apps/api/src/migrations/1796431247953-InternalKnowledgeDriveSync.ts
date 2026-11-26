import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3586 — le Drive interne Bellum devient un RAG produit commun, dans le corpus PARTAGÉ existant
 * `dataforge_rag_chunks` (décision 5 : pas de second corpus).
 *
 * ADDITIF, et posé AVANT le code qui l'écrit (GA-11/GA-12) :
 *  - `dataforge_rag_chunks` gagne `archived_at` (doctrine « on archive » : un fichier sorti du dossier,
 *    supprimé ou modifié voit ses anciens chunks ARCHIVÉS, jamais supprimés) et la source Drive
 *    (`drive_file_id`, `drive_modified_time`, `drive_path`). Les 3 849 chunks ORION existants gardent
 *    ces colonnes à NULL : leur comportement est byte-identique.
 *  - `match_dataforge_rag_chunks` ne rend plus un chunk archivé. Les deux clauses de sauvegarde des
 *    garde-fous qualité (compte NULL, type GARDE_FOU_QUALITE) sont reprises MOT POUR MOT de
 *    `1791510100000-OrionRagChunksVectorSearch` — l'ajout est un `AND` séparé, jamais dans le `OR`.
 *  - `internal_knowledge_files` (une ligne par fichier vu : indexé / ignoré / en erreur / archivé) et
 *    `internal_knowledge_sync_state` (le jeton de page `changes.list`, la dernière synchro) nourrissent
 *    le panneau du back-office. Plomberie de l'opérateur : aucun espace ne les lit.
 */
export class InternalKnowledgeDriveSync1796431247953 implements MigrationInterface {
  public name = 'InternalKnowledgeDriveSync1796431247953'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE dataforge_rag_chunks
        ADD COLUMN IF NOT EXISTS archived_at timestamptz,
        ADD COLUMN IF NOT EXISTS drive_file_id text,
        ADD COLUMN IF NOT EXISTS drive_modified_time text,
        ADD COLUMN IF NOT EXISTS drive_path text
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS dataforge_rag_chunks_drive_file_idx ON dataforge_rag_chunks (drive_file_id) WHERE drive_file_id IS NOT NULL`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS internal_knowledge_files (
        file_id text PRIMARY KEY,
        name text NOT NULL,
        mime_type text NOT NULL,
        path text NOT NULL,
        modified_time text NOT NULL,
        status text NOT NULL,
        error_message text,
        chunk_count integer NOT NULL DEFAULT 0,
        synced_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT internal_knowledge_files_status_check CHECK (status IN ('indexed', 'ignored', 'error', 'archived'))
      )
    `)
    await queryRunner.query(`ALTER TABLE internal_knowledge_files ENABLE ROW LEVEL SECURITY`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS internal_knowledge_sync_state (
        id text PRIMARY KEY,
        page_token text,
        last_run_at timestamptz,
        last_status text,
        last_error text,
        CONSTRAINT internal_knowledge_sync_state_status_check CHECK (last_status IS NULL OR last_status IN ('ok', 'error'))
      )
    `)
    await queryRunner.query(`ALTER TABLE internal_knowledge_sync_state ENABLE ROW LEVEL SECURITY`)

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
