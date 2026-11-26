import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Deux contraintes qui refusent des valeurs que le code déclare — trouvées par
 * GA-12 le 22/08/2026.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. `finance:write` n'était accordable à personne
 * ─────────────────────────────────────────────────────────────────────────────
 * La permission a été ajoutée par le chantier PDF 5 (décision D36) pour ouvrir
 * la facturation au rôle Finance. Elle est bien dans `workspacePermissionValues`
 * et bien portée par le rôle — mais `workspace_member_permissions_check` est
 * restée à ses neuf valeurs d'origine. L'accorder NOMINATIVEMENT à un membre
 * (`PUT /workspaces/members/:id/permissions`) violait donc la contrainte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 2. Trois portes de décision ne pouvaient pas être journalisées
 * ─────────────────────────────────────────────────────────────────────────────
 * `interview_go`, `proof_sufficiency` et `delivery_risk` ont été ajoutées à
 * `DECISION_GATES` par le chantier PDF 6, en fin d'énumération comme le veut
 * GA-08. La contrainte est restée à huit portes. Franchir l'une des trois
 * aurait échoué à l'écriture — et `decision_gate_crossings` est le journal
 * d'AUDIT : son écriture est délibérément bloquante, donc c'est le geste entier
 * qui serait tombé.
 *
 * Les deux sont le même mécanisme, pour la troisième et la quatrième fois :
 * une énumération élargie proprement côté TypeScript, une contrainte SQL
 * oubliée. C'est ce que GA-12 empêche désormais de recommencer.
 *
 * ⚠️ Chaque liste repart de la DERNIÈRE déclaration connue (GA-11) : perdre une
 * valeur en chemin ferait échouer le `ADD CONSTRAINT` sur les lignes existantes,
 * et comme les migrations sont le `preDeployCommand` de Railway, le déploiement
 * entier serait abandonné en silence.
 */
export class WidenGateAndPermissionChecks1789990000002 implements MigrationInterface {
  name = 'WidenGateAndPermissionChecks1789990000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE workspace_member_permissions DROP CONSTRAINT IF EXISTS workspace_member_permissions_check`,
    )
    await queryRunner.query(`
      ALTER TABLE workspace_member_permissions ADD CONSTRAINT workspace_member_permissions_check CHECK (
        permission IN (
          'analysis:run', 'contacts:enrich', 'data:export', 'messages:send',
          'records:write', 'team:manage', 'integrations:manage', 'billing:manage', 'finance:read',
          'finance:write'
        )
      )
    `)

    await queryRunner.query(
      `ALTER TABLE decision_gate_crossings DROP CONSTRAINT IF EXISTS decision_gate_crossings_gate_check`,
    )
    await queryRunner.query(`
      ALTER TABLE decision_gate_crossings ADD CONSTRAINT decision_gate_crossings_gate_check CHECK (
        gate IN (
          'account_priority', 'contact_qualification', 'need_staffable', 'submission_send',
          'playbook_arming', 'erp_write', 'invoice_readiness', 'project_close',
          'interview_go', 'proof_sufficiency', 'delivery_risk'
        )
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE workspace_member_permissions DROP CONSTRAINT IF EXISTS workspace_member_permissions_check`,
    )
    await queryRunner.query(`
      ALTER TABLE workspace_member_permissions ADD CONSTRAINT workspace_member_permissions_check CHECK (
        permission IN (
          'analysis:run', 'contacts:enrich', 'data:export', 'messages:send',
          'records:write', 'team:manage', 'integrations:manage', 'billing:manage', 'finance:read'
        )
      )
    `)
    await queryRunner.query(
      `ALTER TABLE decision_gate_crossings DROP CONSTRAINT IF EXISTS decision_gate_crossings_gate_check`,
    )
    await queryRunner.query(`
      ALTER TABLE decision_gate_crossings ADD CONSTRAINT decision_gate_crossings_gate_check CHECK (
        gate IN (
          'account_priority', 'contact_qualification', 'need_staffable', 'submission_send',
          'playbook_arming', 'erp_write', 'invoice_readiness', 'project_close'
        )
      )
    `)
  }
}
