import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Théo D team-business.N2 — « Un objectif choisi, pas imposé en silence ».
 *
 * Une direction PROPOSE une cible à un membre ; le membre accepte ou refuse.
 * Table neuve, rien n'est modifié ailleurs : `member_objectives` n'est écrite
 * que quand le membre ACCEPTE (la cible actuelle ne bouge jamais en silence).
 *
 * Les sept colonnes de cible reprennent celles de `member_objectives` (NULL =
 * axe non proposé, jamais « proposer 0 »). Trois statuts, contrainte SQL posée
 * AVANT le code qui les écrit (GA-11/GA-12). On archive, on ne supprime pas.
 */
export class ObjectiveProposals1796575106329 implements MigrationInterface {
  public name = 'ObjectiveProposals1796575106329'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS objective_proposals (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        proposed_by uuid NOT NULL,
        period_month date NOT NULL,
        target_meetings integer,
        target_accounts integer,
        target_revenue numeric,
        target_qualified_needs integer,
        target_placements integer,
        target_margin_percent numeric(5,2),
        target_consultants_on_mission integer,
        reason text,
        status text NOT NULL DEFAULT 'proposed',
        responded_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT objective_proposals_status_check CHECK (status IN ('proposed', 'accepted', 'refused')),
        CONSTRAINT objective_proposals_margin_check CHECK (
          target_margin_percent IS NULL OR (target_margin_percent > 0 AND target_margin_percent <= 100)
        )
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS objective_proposals_user_status_idx ON objective_proposals (user_id, status)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS objective_proposals_ws_month_idx ON objective_proposals (workspace_id, period_month)`,
    )
    // RLS : le membre lit ses propositions ; le service (rôle serveur) écrit.
    await queryRunner.query(`ALTER TABLE objective_proposals ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`DROP POLICY IF EXISTS objective_proposals_owner_read ON objective_proposals`)
    await queryRunner.query(
      `CREATE POLICY objective_proposals_owner_read ON objective_proposals FOR SELECT USING (auth.uid() = user_id)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS objective_proposals`)
  }
}
