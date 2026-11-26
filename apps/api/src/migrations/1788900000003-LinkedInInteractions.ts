import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le journal des interactions LinkedIn, déclarées à la main.
 *
 * §5.10 du rapport besoins : « suivre les connexions et réponses »,
 * « enregistrer les interactions LinkedIn importantes dans le CRM ». Le scraping
 * étant refusé (décision Louis, adossée à l'étude ToS du dépôt), le commercial
 * déclare ce qu'il a fait — et Bellum s'en souvient, ce qu'aucun de nous ne fait
 * bien au bout de trente invitations.
 *
 * Pas de contrainte d'unicité : deux messages envoyés le même jour à la même
 * personne sont deux faits distincts. C'est un JOURNAL, pas un état.
 */
export class LinkedInInteractions1788900000003 implements MigrationInterface {
  public name = 'LinkedInInteractions1788900000003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS linkedin_interactions (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id      uuid NOT NULL,
        contact_id   uuid NOT NULL,
        kind         text NOT NULL,
        occurred_at  timestamptz NOT NULL DEFAULT now(),
        note         text,
        created_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT linkedin_interactions_kind_check CHECK (
          kind IN ('connection_sent', 'connection_accepted', 'message_sent', 'reply_received', 'post_engagement')
        )
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS linkedin_interactions_workspace_idx ON linkedin_interactions (workspace_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS linkedin_interactions_contact_idx ON linkedin_interactions (contact_id)`,
    )
    await queryRunner.query(`ALTER TABLE linkedin_interactions ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE POLICY linkedin_interactions_owner ON linkedin_interactions
          USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS linkedin_interactions`)
  }
}
