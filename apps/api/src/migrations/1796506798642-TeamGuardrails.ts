import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4158 (lot L4) — deux tables d'AJOUT SEUL pour les garde-fous entre collègues.
 *
 *  - `workspace_do_not_contact` (#22) : la liste « ne pas contacter » de
 *    l'ESPACE — un contact OU un domaine, un motif obligatoire, l'auteur. On
 *    ne supprime pas : retirer pose `lifted_at` / `lifted_by` (l'historique
 *    reste). ⚠️ Distincte de `contact_stops` (le refus d'une PERSONNE, posé sur
 *    la fiche) et de l'effacement RGPD (c67) : rien de tout cela n'est touché.
 *  - `account_team_members` (#25) : les co-équipiers d'un compte, en plus du
 *    responsable (`accounts.assigned_to`). Liaison compte ↔ membre ; retirer
 *    pose `removed_at`. Ne change PAS la visibilité (tout l'espace voit tout).
 *
 * Aucune ligne existante modifiée, aucune colonne existante touchée.
 */
export class TeamGuardrails1796506798642 implements MigrationInterface {
  public name = 'TeamGuardrails1796506798642'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_do_not_contact (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        kind text NOT NULL,
        contact_id uuid,
        domain text,
        reason text NOT NULL,
        added_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        lifted_at timestamptz,
        lifted_by uuid,
        CONSTRAINT workspace_dnc_kind_check CHECK (kind IN ('contact', 'domain')),
        CONSTRAINT workspace_dnc_target_check CHECK (
          (kind = 'contact' AND contact_id IS NOT NULL AND domain IS NULL)
          OR (kind = 'domain' AND domain IS NOT NULL AND contact_id IS NULL)
        ),
        CONSTRAINT workspace_dnc_reason_check CHECK (length(btrim(reason)) >= 3)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS workspace_dnc_workspace_idx ON workspace_do_not_contact (workspace_id) WHERE lifted_at IS NULL`,
    )
    // Un contact / un domaine ne figure qu'UNE fois à la fois sur la liste.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS workspace_dnc_contact_active ON workspace_do_not_contact (workspace_id, contact_id) WHERE lifted_at IS NULL AND contact_id IS NOT NULL`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS workspace_dnc_domain_active ON workspace_do_not_contact (workspace_id, domain) WHERE lifted_at IS NULL AND domain IS NOT NULL`,
    )
    await queryRunner.query(
      `COMMENT ON TABLE workspace_do_not_contact IS 'Liste « ne pas contacter » de l''espace. Ajout seul : retirer pose lifted_at.'`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS account_team_members (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        account_id uuid NOT NULL,
        user_id uuid NOT NULL,
        added_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        removed_at timestamptz,
        removed_by uuid
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS account_team_members_active ON account_team_members (account_id, user_id) WHERE removed_at IS NULL`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS account_team_members_user_idx ON account_team_members (workspace_id, user_id) WHERE removed_at IS NULL`,
    )
    await queryRunner.query(
      `COMMENT ON TABLE account_team_members IS 'Co-équipiers d''un compte, en plus du responsable. Ajout seul : retirer pose removed_at.'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS account_team_members`)
    await queryRunner.query(`DROP TABLE IF EXISTS workspace_do_not_contact`)
  }
}
