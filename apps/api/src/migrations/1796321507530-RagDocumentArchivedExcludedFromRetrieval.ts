import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2431.5 (reste, épopée #2886 — « Non touché, nommé plutôt que deviné ») —
 * un document RAG remplacé (`archived_at` posé par `RagService.replaceDocument`,
 * migration 1796321507100) restait quand même retrouvable par la RÉCUPÉRATION
 * GÉNÉRALE (pgvector RPC + repli plein texte) : « Remplacer » excluait déjà le
 * document de l'écran Connaissances (`listForWorkspace`), mais pas du fondement
 * d'une réponse du copilote — un document remplacé pouvait continuer à grounder
 * une analyse, silencieusement.
 *
 * CE QUE CETTE MIGRATION FAIT
 *  1. `match_rag_documents` (RPC vectorielle) — même signature, prédicat élargi :
 *     `rd.archived_at IS NULL` en plus du prédicat de portée existant (#2779).
 *     Pas de changement de signature ⇒ pas de DROP FUNCTION nécessaire.
 *  2. Le repli plein texte/ILIKE applique le MÊME prédicat côté service
 *     (`_scope_retrieval`, `apps/ia/app/services/rag_service.py`) — jamais un
 *     seul des deux moteurs scopé (même discipline que #2779).
 *
 * Ce qui NE change PAS : `fetch_documents_by_ids` (lecture par identifiant —
 * une citation déjà rendue ou l'historique du copilote continue de retrouver
 * le document archivé, doctrine « on archive, on ne supprime pas », le contenu
 * reste lisible).
 *
 * GA-11/GA-12 — cette migration (le prédicat SQL) précède le déploiement du
 * service Python qui en dépend.
 *
 * Idempotent (`CREATE OR REPLACE`). `down` non supporté (convention du dépôt).
 */
export class RagDocumentArchivedExcludedFromRetrieval1796321507530 implements MigrationInterface {
  public name = 'RagDocumentArchivedExcludedFromRetrieval1796321507530'

  public async up(queryRunner: QueryRunner): Promise<void> {
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
          -- #2431.5 : un document remplacé ne grounde plus la récupération générale.
          AND rd.archived_at IS NULL
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
