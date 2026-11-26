import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2056 (appels d'offres) et #2057 (contenu) — les deux canaux que le
 * questionnaire ne demandait pas encore une réponse (voir
 * `.claude/notes/registre-2026-09-15-onboarding-questionnaire.md`, lignes
 * `| 2056.x |` et `| 2057.x |`).
 *
 * Additive et idempotente : aucune colonne existante n'est touchée, aucune
 * valeur n'est écrite. Les colonnes texte sont NULLABLE (le questionnaire ne
 * bloque jamais) et les colonnes tableau démarrent à `'{}'` (une réponse
 * jamais donnée reste un tableau vide, jamais `null` — même convention que
 * `ProfileQuestionnaire1784819567318`).
 */
export class RfpAndContentQuestions1794300000001 implements MigrationInterface {
  name = 'RfpAndContentQuestions1794300000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS rfp_platforms_used text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS rfp_referencing_status text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS rfp_lot_allocation text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS rfp_response_templates text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS rfp_volume text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS rfp_volume_period text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS rfp_outcomes text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS rfp_go_no_go_process text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS rfp_document_readiness text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS content_active_profile text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS content_audience_size text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS content_visible_expertise text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS content_reactions text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS content_conversations_generated text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS content_funnel_stages_reached text[] NOT NULL DEFAULT '{}';
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS rfp_platforms_used;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS rfp_referencing_status;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS rfp_lot_allocation;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS rfp_response_templates;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS rfp_volume;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS rfp_volume_period;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS rfp_outcomes;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS rfp_go_no_go_process;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS rfp_document_readiness;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS content_active_profile;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS content_audience_size;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS content_visible_expertise;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS content_reactions;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS content_conversations_generated;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS content_funnel_stages_reached;
    `)
  }
}
