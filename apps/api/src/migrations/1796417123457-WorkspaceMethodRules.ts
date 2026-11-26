import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3295 — PROMOTION RÉELLE d'une proposition d'apprentissage adoptée.
 *
 * `workspace_method_rules` : une ligne par proposition adoptée, née
 * `enabled = false` avec sa raison (`activation_review_pending`) — l'adoption
 * ne modifie jamais le comportement de Laura, l'activation est un geste
 * séparé. `domain` contraint aux onze domaines canoniques de
 * `METHOD_RULE_DOMAINS` (GA-11/GA-12), `disabled_reason` obligatoire dès que
 * la règle est désactivée — même invariant que `methodRuleGovernanceSchema`.
 *
 * RLS : un filet (lecture membre) ; l'autorisation réelle vit dans le service.
 */
export class WorkspaceMethodRules1796417123457 implements MigrationInterface {
  name = 'WorkspaceMethodRules1796417123457'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_method_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        proposal_id uuid NOT NULL REFERENCES lost_deal_rule_proposals (id) ON DELETE CASCADE,
        domain text NOT NULL,
        statement text NOT NULL,
        owner uuid,
        enabled boolean NOT NULL DEFAULT false,
        disabled_reason text,
        activated_by uuid,
        activated_at timestamptz,
        promoted_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT workspace_method_rules_domain_check
          CHECK (domain IN ('Compte', 'Contact', 'Signal', 'Besoin', 'Talent', 'Mission', 'Action', 'Partenaire', 'Opportunité', 'ProfileContext', 'methode')),
        CONSTRAINT workspace_method_rules_disabled_reason_check
          CHECK (enabled OR disabled_reason IS NOT NULL)
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS workspace_method_rules_proposal_idx
        ON workspace_method_rules (proposal_id)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS workspace_method_rules_workspace_idx
        ON workspace_method_rules (workspace_id)
    `)
    await queryRunner.query(`ALTER TABLE workspace_method_rules ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`DROP POLICY IF EXISTS "workspace_method_rules_member_read" ON workspace_method_rules`)
    await queryRunner.query(`
      CREATE POLICY "workspace_method_rules_member_read" ON workspace_method_rules FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS workspace_method_rules`)
  }
}
