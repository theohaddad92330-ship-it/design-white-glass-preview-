import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2081.14 — LES RÈGLES D'ESPACE (DÉCISION Louis 19/09/2026).
 *
 * ── CE QU'UNE LIGNE EST ──────────────────────────────────────────────────────
 * Les règles qu'un administrateur a posées pour TOUT l'espace, et qui priment
 * sur les réglages individuels : la visibilité des comptes rattachés à une
 * unité, et qui peut exporter. UNE ligne par espace, créée au premier
 * changement. AUCUNE ligne = les valeurs par défaut, qui sont le comportement
 * d'avant la règle : personne ne perd ni ne gagne un accès au déploiement.
 *
 * ── LA TRACE ─────────────────────────────────────────────────────────────────
 * Chaque règle porte qui l'a changée en dernier (`*_changed_by`) et quand
 * (`*_changed_at`). `NULL` = jamais changée : c'est la valeur par défaut, et
 * l'écran le dit. `ON DELETE SET NULL` : un compte supprimé (RGPD) emporte
 * son identité, pas la règle qu'il a posée.
 *
 * ── LA CONTRAINTE D'ABORD, LE CODE ENSUITE (GA-11 / GA-12) ───────────────────
 * Les deux listes sont celles du contrat partagé (`workspace-rules.ts`) :
 * `businessUnitAccountsVisibilityValues` et `workspaceExportPolicyValues`.
 * Élargir un catalogue se fait ICI, dans une migration, AVANT le code.
 *
 * ── RLS : UN FILET, PAS LA SERRURE ───────────────────────────────────────────
 * L'API se connecte en superuser ; l'autorisation réelle vit dans
 * `WorkspaceRulesService` (propriétaire ou administrateur). La politique
 * protège l'autre porte, un accès direct avec un JWT Supabase : un membre LIT
 * les règles de son espace ; AUCUNE politique d'écriture — une règle qui prime
 * sur les réglages de tous ne s'écrit pas en contournant l'API.
 */
export class WorkspaceRules1789808789203 implements MigrationInterface {
  name = 'WorkspaceRules1789808789203'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_rules (
        workspace_id uuid PRIMARY KEY REFERENCES workspaces (id) ON DELETE CASCADE,
        business_unit_accounts_visibility text NOT NULL DEFAULT 'shared',
        business_unit_accounts_visibility_changed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
        business_unit_accounts_visibility_changed_at timestamptz,
        export_policy text NOT NULL DEFAULT 'everyone',
        export_policy_changed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
        export_policy_changed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT workspace_rules_business_unit_accounts_visibility_check
          CHECK (business_unit_accounts_visibility IN ('shared', 'private')),
        CONSTRAINT workspace_rules_export_policy_check CHECK (export_policy IN ('everyone', 'admins'))
      )
    `)

    await queryRunner.query(`ALTER TABLE workspace_rules ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`DROP POLICY IF EXISTS "workspace_rules_member_read" ON workspace_rules`)
    await queryRunner.query(`
      CREATE POLICY "workspace_rules_member_read" ON workspace_rules FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS workspace_rules`)
  }
}
