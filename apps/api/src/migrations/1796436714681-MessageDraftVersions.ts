import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LA TRACE DU BROUILLON, EN BASE (#3695.4/.6, #3696).
 *
 * Le fil d'un contact (brouillon généré, modèle approuvé inséré, style
 * appliqué, correction manuelle) vivait uniquement en mémoire de session
 * (`draft-store.ts`, web) : fermer l'onglet l'abandonnait, et aucune démo ne
 * pouvait montrer un brouillon déjà là à l'ouverture du panneau. La
 * contrainte sur `channel` est posée ICI, avant le code qui écrit (GA-11/12) —
 * les quatre canaux du composer, jamais un cinquième deviné.
 *
 * Ligne d'audit, jamais corrigée : une nouvelle variante ou une correction
 * manuelle ajoute sa propre ligne (même choix que `introduction_authorizations`).
 */
export class MessageDraftVersions1796436714681 implements MigrationInterface {
  public name = 'MessageDraftVersions1796436714681'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS message_draft_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        contact_id uuid NOT NULL,
        channel text NOT NULL,
        subject text,
        body text NOT NULL,
        edited_subject text,
        edited_body text,
        used_template_source text,
        used_template_version integer,
        used_style_id uuid,
        unchanged boolean NOT NULL DEFAULT false,
        angle text,
        recorded_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT message_draft_versions_channel_check CHECK (channel IN ('email','linkedin','phone','task'))
      )
    `)

    // La lecture attendue à l'ouverture du panneau : « le fil de CE contact sur
    // CE canal », dans l'ordre d'apparition.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_message_draft_versions_contact
        ON message_draft_versions (contact_id, workspace_id, channel, created_at)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
