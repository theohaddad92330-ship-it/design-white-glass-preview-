import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1954.7 — un document joint au chat sert au FIL, pas à l'espace entier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT (éclaireur, à re-vérifier par l'écrivain — c'est fait, VRAI)
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque pièce jointe du chat était ingérée EN SILENCE dans la base de
 * connaissance DURABLE de TOUT l'espace : `RagController.ingest`
 * (`rag.controller.ts`) n'a jamais eu de notion de portée, et
 * `RagService.listForWorkspace` (`rag.service.ts`) rend tous les documents de
 * l'espace sans distinction — le chat utilise `useIngestRagDocument`, LE MÊME
 * hook que `/knowledge`. « Retirer avant envoi » (côté écran) ne supprimait pas
 * le document déjà ingéré : il restait dans le magasin, grounding chaque
 * analyse et chaque autre fil de l'équipe, pour toujours.
 *
 * Décision de Louis (12/09/2026) : un document joint au chat sert au FIL par
 * défaut ; il n'entre dans la base de l'ESN que sur un choix EXPLICITE ;
 * « retirer » le supprime (`DELETE /rag-documents/:id`, déjà cloisonné par
 * auteur — `RagService.deleteForUser`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION FAIT — ADDITIF, AUCUN CHANGEMENT DE VISIBILITÉ RÉTROACTIF
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. `scope` — `'workspace'` (défaut) ou `'conversation'`. Une colonne `text
 *     NOT NULL DEFAULT 'workspace'` ajoutée en une instruction : Postgres
 *     backfille chaque ligne existante avec le défaut sans réécrire la table
 *     (11+), donc TOUS les documents déjà en base restent `workspace` — c'est
 *     très exactement « aucun changement de visibilité rétroactif ».
 *  2. `conversation_id` — le fil visé quand `scope = 'conversation'`, sinon
 *     NULL. Texte libre (même espace de noms que `chat_messages.conversation_id`
 *     depuis la migration `1786500000000` — un id synthétique du web, pas un
 *     UUID), donc nullable et sans clé étrangère.
 *  3. `rag_documents_scope_check` — la contrainte SQL AVANT le code qui écrit
 *     la valeur (GA-11/GA-12) : `scope IN ('workspace', 'conversation')`.
 *     Énumération TypeScript miroir : `RAG_DOCUMENT_SCOPES`
 *     (`packages/contracts/src/schemas/rag.ts`).
 *  4. `rag_documents_conversation_scope_requires_id_check` — un document
 *     `conversation` sans `conversation_id` n'a pas de fil à qui appartenir ;
 *     rejeté à l'écriture, pas seulement à la validation zod côté NestJS.
 *  5. `match_rag_documents` (RPC pgvector) — même signature qu'après
 *     `1787950000000-RagMatchCreatedAt` (donc un `CREATE OR REPLACE` simple
 *     suffit, pas de `DROP FUNCTION` : la signature ne change pas, seul le
 *     corps le fait), + `rd.scope = 'workspace'` dans le `WHERE`. Sans ce
 *     filtre, le chemin vectoriel (actif dès `EMBEDDING_API_KEY` posée)
 *     grounderait une recherche générale — ou une analyse de compte — sur un
 *     CV joint au chat de quelqu'un d'autre. Le repli plein texte
 *     (`TextSearchFallback`, `apps/ia/app/services/rag_service.py`) applique
 *     le même filtre côté service (`_scope_workspace`), pour ne jamais scoper
 *     un seul des deux moteurs — la leçon déjà tirée par
 *     `1786970000000-RagWorkspaceScope`.
 *
 * Ce que cette migration NE fait PAS : elle ne touche ni la RLS
 * (`rag_documents_workspace_access`, `1784600000001`) — c'est un filet de
 * dernier recours, pas la barrière primaire (l'API se connecte en superuser,
 * l'IA en `service_role`, tous deux BYPASSRLS) — ni la lecture par identifiant
 * (`fetch_documents_by_ids`, la porte des pièces jointes du tour de chat), qui
 * a besoin de lire À LA FOIS le `workspace` et SA propre `conversation` : elle
 * est traitée côté service (`apps/ia/app/services/rag_service.py`), pas ici.
 *
 * Idempotent : `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` puis
 * `ADD CONSTRAINT`, `CREATE INDEX IF NOT EXISTS`. `down` non supporté
 * (convention du dépôt) — tester `up` sur une copie avant Railway.
 */
export class RagDocumentConversationScope1792800004817 implements MigrationInterface {
  public name = 'RagDocumentConversationScope1792800004817'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rag_documents
        ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'workspace',
        ADD COLUMN IF NOT EXISTS conversation_id text
    `)

    await queryRunner.query(`ALTER TABLE rag_documents DROP CONSTRAINT IF EXISTS rag_documents_scope_check`)
    await queryRunner.query(`
      ALTER TABLE rag_documents
        ADD CONSTRAINT rag_documents_scope_check CHECK (scope IN ('workspace', 'conversation'))
    `)

    await queryRunner.query(`
      ALTER TABLE rag_documents
        DROP CONSTRAINT IF EXISTS rag_documents_conversation_scope_requires_id_check
    `)
    await queryRunner.query(`
      ALTER TABLE rag_documents
        ADD CONSTRAINT rag_documents_conversation_scope_requires_id_check
        CHECK (scope <> 'conversation' OR conversation_id IS NOT NULL)
    `)

    // Le chemin de lecture d'un fil précis (`fetch_documents_by_ids`) filtre
    // sur `conversation_id` — un index partiel, léger (seules les lignes
    // `conversation` en portent un).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_rag_documents_conversation_id
        ON rag_documents (conversation_id)
        WHERE conversation_id IS NOT NULL
    `)

    // Signature INCHANGÉE depuis 1787950000000 — CREATE OR REPLACE suffit,
    // aucun DROP nécessaire (une signature identique ne crée pas de surcharge).
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
          -- #1954.7 : un document JOINT a une conversation ne grounde jamais
          -- une recherche generale ni une analyse de compte -- seul
          -- fetch_documents_by_ids (le tour de chat de SON fil) le lit.
          AND rd.scope = 'workspace'
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
