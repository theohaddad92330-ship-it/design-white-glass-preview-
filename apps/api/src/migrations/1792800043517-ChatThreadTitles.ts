import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1911.1 / #1911.12 / #1955.1 — LE TITRE D'UN FIL DE LAURA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CONSTAT
 * ─────────────────────────────────────────────────────────────────────────────
 * Un fil s'appelait par son premier message, brut, et rien ne permettait de le
 * renommer. Décision de Louis (12/09/2026) : « Rédigé par Laura, sans quota » —
 * un titre court écrit par un petit modèle après le 2e échange, modifiable à la
 * main.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE TABLE NEUVE
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucune table ne porte l'état d'un fil : l'archivage estampille chaque message
 * (`chat_messages.archived_at`, migration `1790113847215`). Un titre a un
 * auteur et se renomme ; il vit donc à côté, une ligne par (espace, fil).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PORTE « AJOUT SEULEMENT »
 * ─────────────────────────────────────────────────────────────────────────────
 * Création pure : aucune colonne existante n'est touchée, aucune donnée
 * réécrite. L'existant n'a aucune ligne ici, donc tout fil garde son premier
 * message pour titre jusqu'à son prochain 2e échange ou un renommage. Le `CHECK`
 * sur `title_source` est posé DÈS LA CRÉATION — la contrainte précède le code
 * qui écrit la valeur (GA-11 / GA-12). `down()` ne fait tomber que ce que `up()`
 * a créé. Rejouable : chaque instruction tolère d'avoir déjà tourné (leçon de
 * `1792617384219`, bloquée en production par un `ADD CONSTRAINT` rejoué).
 */
export class ChatThreadTitles1792800043517 implements MigrationInterface {
  name = 'ChatThreadTitles1792800043517'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS chat_thread_titles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        -- c:<conversation_id> ou a:<account_id> : la désignation de l'archivage.
        thread_key text NOT NULL,
        title text NOT NULL,
        title_source text NOT NULL,
        -- Qui a posé le titre (saisi, ou dont le tour a déclenché Laura).
        set_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'chat_thread_titles_title_source_check'
        ) THEN
          ALTER TABLE chat_thread_titles
          ADD CONSTRAINT chat_thread_titles_title_source_check
          CHECK (title_source IN ('laura', 'user'));
        END IF;
      END $$;
    `)

    // Un titre par fil et par espace — la cible des deux écritures : l'insertion
    // « si absent » de Laura et l'écrasement du renommage.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS chat_thread_titles_thread_unique
      ON chat_thread_titles (workspace_id, thread_key)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS chat_thread_titles_thread_unique`)
    await queryRunner.query(`DROP TABLE IF EXISTS chat_thread_titles`)
  }
}
