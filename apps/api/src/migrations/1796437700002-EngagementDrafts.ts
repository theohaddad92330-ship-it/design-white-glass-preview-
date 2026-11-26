import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3694.7 (lot K07, 07/10/2026) — le brief confirmé (objectif, relation,
 * angle, paramètres) ET le fil qui le porte survivaient dans un `Map` en
 * mémoire de session (`draft-store.ts`) : fermer l'onglet ou recharger la page
 * perdait tout, alors que « Corriger le brief » promet de le retrouver.
 *
 * Une ligne par (utilisateur, contact, canal) : un brouillon appartient à qui
 * l'écrit, jamais partagé entre deux commerciaux sur le même contact — c'est
 * la même portée que le `Map` qu'elle remplace (une session = un utilisateur).
 * `entries`/`parameters` sont des JSON opaques côté SQL : leur forme vit dans
 * le typage TypeScript (`ConversationEntry`, `MessageParameters`), revalidée
 * par `engagementDraftSnapshotSchema` (bornes de taille) avant l'écriture —
 * la table ne contraint qu'IDENTIFIANTS et CANAL, posés ICI avant le code qui
 * les écrit (GA-11/GA-12).
 */
export class EngagementDrafts1796437700002 implements MigrationInterface {
  public name = 'EngagementDrafts1796437700002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS engagement_drafts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        channel text NOT NULL,
        entries jsonb NOT NULL DEFAULT '[]'::jsonb,
        context text NOT NULL DEFAULT '',
        parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT engagement_drafts_channel_check CHECK (channel IN ('email', 'linkedin', 'phone', 'task')),
        CONSTRAINT engagement_drafts_unique UNIQUE (user_id, contact_id, channel)
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS engagement_drafts_workspace_idx ON engagement_drafts (workspace_id)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
