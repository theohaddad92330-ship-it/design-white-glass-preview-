import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3417 (retour bêta 30/09, fiche contact) — la bibliothèque versionnée des
 * scripts et messages approuvés. Table de RÉFÉRENCE : peuplée par migration/
 * seed (voir `DemoSeedService` pour la démo), lue par
 * `ApprovedMessageTemplateService` — aucune écriture applicative dans cette
 * tranche, donc aucune colonne `user_id`/`workspace_id` (contrairement à
 * `message_style_templates`, qui EST écrit par le produit).
 *
 * Les trois contraintes CHECK sont la copie exacte de
 * `APPROVED_TEMPLATE_SCENARIO_IDS` / `OUTREACH_MESSAGE_CHANNELS` /
 * `APPROVED_TEMPLATE_STATUSES` (`@bellum/contracts`), posées AVANT le code
 * qui les écrit (GA-11/GA-12). `persona` n'a pas de contrainte : `null`
 * (« tous les personas ») est une valeur valide en plus des sept de
 * `OUTREACH_PERSONAS`, et une contrainte qui les récrirait toutes ici
 * divergerait de la source au premier ajout de persona.
 */
export class OutreachApprovedTemplates1796409451317 implements MigrationInterface {
  name = 'OutreachApprovedTemplates1796409451317'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS outreach_approved_templates (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        scenario          text NOT NULL,
        channel           text NOT NULL,
        persona           text,
        sequence_step     integer NOT NULL,
        delay_days        integer NOT NULL,
        version           integer NOT NULL DEFAULT 1,
        source            text NOT NULL,
        exact_text        text NOT NULL,
        variables         jsonb NOT NULL DEFAULT '[]'::jsonb,
        required_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
        forbidden_claims  jsonb NOT NULL DEFAULT '[]'::jsonb,
        status            text NOT NULL DEFAULT 'active',
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT outreach_approved_templates_scenario_check CHECK (scenario IN (
          'invitation_acceptee', 'connexion_dormante', 'contact_recommande', 'approche_froide',
          'contexte_partenaire', 'appel_sans_contexte', 'prospection_inversee_consultant',
          'objections_client', 'objections_consultant', 'cloture_elegante')),
        CONSTRAINT outreach_approved_templates_channel_check CHECK (channel IN (
          'email', 'linkedin', 'phone', 'manual', 'voicemail', 'recommendation')),
        CONSTRAINT outreach_approved_templates_status_check CHECK (status IN ('active', 'archived')),
        CONSTRAINT outreach_approved_templates_sequence_step_positive CHECK (sequence_step > 0),
        CONSTRAINT outreach_approved_templates_delay_days_non_negative CHECK (delay_days >= 0),
        CONSTRAINT outreach_approved_templates_version_positive CHECK (version > 0)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_outreach_approved_templates_lookup
       ON outreach_approved_templates (scenario, channel, status)`,
    )
    // Service-role only, comme `message_style_templates` : RLS activée, aucune
    // policy — le produit lit cette table via l'API (clé de service), jamais
    // depuis le navigateur.
    await queryRunner.query(`ALTER TABLE outreach_approved_templates ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS outreach_approved_templates`)
  }
}
