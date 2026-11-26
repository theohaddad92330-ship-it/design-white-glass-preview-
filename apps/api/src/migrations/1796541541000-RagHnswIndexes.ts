import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Audit IA M2 — l'index vectoriel du RAG ne retrouvait pas les documents d'un petit espace.
 *
 * LE DÉFAUT. `rag_documents_embedding_idx` et `rag_document_chunks_embedding_idx` étaient des
 * IVFFLAT `lists = 100` créés sur des tables VIDES (Init, RagDocumentChunks) : les centroïdes
 * ne reflètent aucune donnée, et `ivfflat.probes` (1 par défaut) n'est réglé nulle part. Une
 * requête n'examine donc qu'UNE liste sur 100, PUIS applique le filtre espace / portée / seuil :
 * un petit espace reçoit 0 ou 1 résultat alors que ses documents existent (le repli plein texte
 * masquait le défaut), et plus la base grossit, pire c'est.
 *
 * LE CORRECTIF.
 *  1. Les deux index passent en HNSW `vector_cosine_ops` (l'opérateur réellement utilisé par les
 *     requêtes : `<=>`). HNSW n'a pas de centroïdes à entraîner : il est correct sur une table
 *     vide ET sur une table pleine, sans REINDEX périodique.
 *  2. `match_rag_documents` (seule RPC dont l'ORDER BY est directement `embedding <=> q`, donc
 *     seule à pouvoir utiliser l'index) règle, pour sa transaction, `hnsw.ef_search = 200` et,
 *     si pgvector ≥ 0.8, `hnsw.iterative_scan = strict_order` : l'index continue de produire des
 *     candidats jusqu'à remplir le LIMIT APRÈS filtre (espace, portée, seuil), au lieu de
 *     s'arrêter à `ef_search` candidats dont aucun n'appartient à l'espace. Sur pgvector < 0.8
 *     le paramètre n'existe pas : l'erreur est avalée et seul `ef_search` s'applique (version
 *     cible non vérifiable depuis le dépôt — Supabase ≥ 0.8 depuis fin 2024).
 *     `search_rag_document_chunks` ordonne par un CASE (vecteur OU plein texte) : le planificateur
 *     n'y utilise pas l'index, le balayage reste exact — inchangé.
 *
 * RISQUES D'EXPLOITATION. `CREATE INDEX` (sans CONCURRENTLY : le migrateur est transactionnel)
 * pose un verrou SHARE sur la table pendant la construction — lectures permises, ÉCRITURES
 * (ingestion de documents) bloquées. La construction HNSW est plus longue que ivfflat (de
 * l'ordre de la seconde à quelques dizaines de secondes pour quelques dizaines de milliers de
 * vecteurs 1536 dimensions, mémoire `maintenance_work_mem` conseillée ≥ 256 Mo) ; le DROP de
 * l'ancien index prend un bref ACCESS EXCLUSIVE. À jouer hors pic d'ingestion.
 *
 * Réversible : `down` recrée les ivfflat d'origine et la RPC sans réglage.
 */
export class RagHnswIndexes1796541541000 implements MigrationInterface {
  public name = 'RagHnswIndexes1796541541000'

  private matchFunction(withTuning: boolean): string {
    const tuning = withTuning
      ? `
        -- Audit IA M2 : recall HNSW sur un filtre sélectif. Local à la transaction de l'appel.
        PERFORM set_config('hnsw.ef_search', '200', true);
        BEGIN
          PERFORM set_config('hnsw.iterative_scan', 'strict_order', true);
        EXCEPTION WHEN OTHERS THEN
          NULL; -- pgvector < 0.8 : pas de balayage itératif, ef_search seul s'applique.
        END;
`
      : ''
    return `
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
      BEGIN${tuning}
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
          AND rd.archived_at IS NULL
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
    `
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS rag_documents_embedding_idx`)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS rag_documents_embedding_idx
      ON rag_documents
      USING hnsw (embedding extensions.vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `)
    await queryRunner.query(`DROP INDEX IF EXISTS rag_document_chunks_embedding_idx`)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS rag_document_chunks_embedding_idx
      ON rag_document_chunks
      USING hnsw (embedding extensions.vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `)
    await queryRunner.query(this.matchFunction(true))
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(this.matchFunction(false))
    await queryRunner.query(`DROP INDEX IF EXISTS rag_document_chunks_embedding_idx`)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS rag_document_chunks_embedding_idx
      ON rag_document_chunks
      USING ivfflat (embedding extensions.vector_cosine_ops)
      WITH (lists = 100)
    `)
    await queryRunner.query(`DROP INDEX IF EXISTS rag_documents_embedding_idx`)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS rag_documents_embedding_idx
      ON rag_documents
      USING ivfflat (embedding extensions.vector_cosine_ops)
      WITH (lists = 100)
    `)
  }
}
