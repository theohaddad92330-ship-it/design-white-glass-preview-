import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3750 — LES MORCEAUX CITABLES D'UN DOCUMENT DE CONNAISSANCE.
 *
 * Un document était ingéré d'un seul tenant : UN embedding (titre + 2 000
 * premiers caractères), UN extrait de 400 caractères au prompt. Un classeur de
 * dix onglets ne laissait jamais passer son septième (« 07 · Objections ») —
 * invisible au vecteur, coupé avant le prompt. Le service IA découpe désormais
 * chaque document par onglet / diapositive / section (`rag_chunking.py`) et
 * écrit ici un morceau par unité, chacun avec SON embedding.
 *
 * ADDITIVE : `rag_documents` ne change pas (même ligne, même contenu, même
 * embedding) — un document sans morceau (pas encore rattrapé) reste retrouvé
 * par l'ancien chemin, byte-identique.
 *
 * - `document_id` → `rag_documents` ON DELETE CASCADE : effacer le parent
 *   (purge M3, effacement RGPD, reset démo) emporte ses morceaux ;
 * - RLS : le prédicat EXACT de `rag_documents_workspace_access`
 *   (migration 1784600000001) — membre de l'espace, ou auteur d'une ligne
 *   sans espace ;
 * - `search_rag_document_chunks` : la visibilité EXACTE de
 *   `match_rag_documents` (migration 1796321507530 — archivé exclu, portées
 *   #2779, espace avec repli auteur), lue sur le PARENT ; vecteur quand un
 *   `query_embedding` est passé, plein texte sinon (zéro clé = zéro réseau) ;
 * - `rag_documents_pending_chunks` : le rattrapage (#3750.4) — les documents
 *   longs sans morceau, par petit lot, jamais tout le parc d'un coup.
 *
 * GA-11/GA-12 — cette migration précède le déploiement du service Python qui
 * écrit et lit la table ; tant qu'elle n'a pas tourné, l'IA journalise l'échec
 * d'écriture des morceaux et retombe sur l'ancien chemin.
 */
export class RagDocumentChunks1796434817523 implements MigrationInterface {
  public name = 'RagDocumentChunks1796434817523'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS rag_document_chunks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id uuid NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        workspace_id uuid NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        chunk_index integer NOT NULL,
        unit_label text NOT NULL DEFAULT '',
        content text NOT NULL,
        embedding extensions.vector(1536),
        search tsvector GENERATED ALWAYS AS (
          to_tsvector('french'::regconfig, coalesce(unit_label, '') || ' ' || coalesce(content, ''))
        ) STORED,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT rag_document_chunks_chunk_index_check CHECK (chunk_index >= 0),
        CONSTRAINT rag_document_chunks_document_chunk_key UNIQUE (document_id, chunk_index)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_rag_document_chunks_workspace ON rag_document_chunks (workspace_id)`,
    )
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_rag_document_chunks_user ON rag_document_chunks (user_id)`)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS rag_document_chunks_embedding_idx
      ON rag_document_chunks
      USING ivfflat (embedding extensions.vector_cosine_ops)
      WITH (lists = 100)
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS rag_document_chunks_search_idx ON rag_document_chunks USING gin (search)`,
    )

    const memberOf = `workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())`
    const memberOrOwner = `(${memberOf} OR (workspace_id IS NULL AND user_id = auth.uid()))`
    await queryRunner.query(`ALTER TABLE rag_document_chunks ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`DROP POLICY IF EXISTS "rag_document_chunks_workspace_access" ON rag_document_chunks`)
    await queryRunner.query(`
      CREATE POLICY "rag_document_chunks_workspace_access" ON rag_document_chunks FOR ALL
        USING (${memberOrOwner})
        WITH CHECK (${memberOrOwner})
    `)

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION search_rag_document_chunks(
        query_text text,
        query_embedding extensions.vector(1536) DEFAULT NULL,
        match_threshold float DEFAULT 0.5,
        match_count int DEFAULT 6,
        filter_user_id uuid DEFAULT NULL,
        filter_workspace_id uuid DEFAULT NULL,
        filter_account_id uuid DEFAULT NULL
      )
      RETURNS TABLE (
        chunk_id uuid,
        document_id uuid,
        title text,
        category text,
        origin text,
        created_at timestamptz,
        unit_label text,
        chunk_index int,
        content text,
        similarity float
      )
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RETURN QUERY
        SELECT
          c.id,
          c.document_id,
          rd.title,
          rd.category,
          rd.origin,
          rd.created_at,
          c.unit_label,
          c.chunk_index,
          c.content,
          CASE
            WHEN query_embedding IS NOT NULL THEN (1 - (c.embedding <=> query_embedding))::float
            ELSE NULL::float
          END AS similarity
        FROM rag_document_chunks c
        JOIN rag_documents rd ON rd.id = c.document_id
        WHERE
          -- #2431.5 : un document remplacé ne grounde plus la récupération générale.
          rd.archived_at IS NULL
          -- #2779 : qui peut lire quoi (jamais un document de fil ici).
          AND (
            rd.scope IN ('workspace', 'knowledge_base')
            OR (rd.scope = 'personal' AND rd.user_id = filter_user_id)
            OR (rd.scope = 'account' AND filter_account_id IS NOT NULL AND rd.account_id = filter_account_id)
          )
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
          AND (
            CASE
              WHEN query_embedding IS NOT NULL THEN
                c.embedding IS NOT NULL AND 1 - (c.embedding <=> query_embedding) > match_threshold
              ELSE
                c.search @@ websearch_to_tsquery('french', query_text)
            END
          )
        ORDER BY
          CASE WHEN query_embedding IS NOT NULL THEN c.embedding <=> query_embedding END ASC,
          CASE WHEN query_embedding IS NULL THEN ts_rank(c.search, websearch_to_tsquery('french', query_text)) END DESC,
          c.chunk_index ASC
        LIMIT match_count;
      END;
      $$
    `)
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION search_rag_document_chunks TO authenticated`)
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION search_rag_document_chunks TO service_role`)

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION rag_documents_pending_chunks(
        min_chars int DEFAULT 2000,
        batch_size int DEFAULT 20
      )
      RETURNS TABLE (
        id uuid,
        title text,
        content text,
        user_id uuid,
        workspace_id uuid
      )
      LANGUAGE sql
      STABLE
      AS $$
        SELECT rd.id, rd.title, rd.content, rd.user_id, rd.workspace_id
        FROM rag_documents rd
        WHERE length(rd.content) > min_chars
          AND rd.archived_at IS NULL
          AND rd.scope <> 'conversation'
          AND NOT EXISTS (SELECT 1 FROM rag_document_chunks c WHERE c.document_id = rd.id)
        ORDER BY rd.created_at ASC
        LIMIT batch_size
      $$
    `)
    await queryRunner.query(`GRANT EXECUTE ON FUNCTION rag_documents_pending_chunks TO service_role`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
