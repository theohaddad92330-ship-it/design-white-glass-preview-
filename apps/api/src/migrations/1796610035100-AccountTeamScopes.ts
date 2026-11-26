import { MigrationInterface, QueryRunner } from 'typeorm'
import { ACCOUNT_TEAM_SCOPE_LABEL_MAX, ACCOUNT_TEAM_SCOPE_LABEL_MIN } from '@bellum/contracts'

/**
 * #4996 L1 (Refs #4731) — le périmètre d'un membre sur un compte groupe : « qui adresse quelle entité du client ».
 * ÉTENDRE seulement (conception §2.4) : une table, ses index, sa RLS en lecture. Aucun comportement ne change.
 *
 * - `entity_id` NULL = texte libre (ou entité retirée : `label` garde le nom, la zone ne disparaît pas en silence).
 * - Clé `(account_id, user_id)` sans FK vers `account_team_members` : le responsable (`assigned_to`) n'y figure pas.
 * - Deux membres peuvent couvrir la même entité : aucune unicité par entité seule.
 * - Les bornes du libellé viennent du contrat (`ACCOUNT_TEAM_SCOPE_LABEL_*`) : une seule source (GA-11/12).
 * - RLS : filet de lecture ; l'API est BYPASSRLS et reste la vraie barrière. La même politique de lecture manquait
 *   sur `account_team_members` (ajout seul, aucune colonne touchée).
 */
export class AccountTeamScopes1796610035100 implements MigrationInterface {
  public name = 'AccountTeamScopes1796610035100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS account_team_scopes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        user_id uuid NOT NULL,
        entity_id uuid REFERENCES account_entities(id) ON DELETE SET NULL,
        label text NOT NULL,
        added_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        removed_at timestamptz,
        removed_by uuid,
        CONSTRAINT account_team_scopes_label_check CHECK (length(btrim(label)) BETWEEN ${ACCOUNT_TEAM_SCOPE_LABEL_MIN} AND ${ACCOUNT_TEAM_SCOPE_LABEL_MAX}),
        CONSTRAINT account_team_scopes_removed_pair_check CHECK ((removed_at IS NULL) = (removed_by IS NULL))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS account_team_scopes_entity_active
        ON account_team_scopes (account_id, user_id, entity_id) WHERE removed_at IS NULL AND entity_id IS NOT NULL
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS account_team_scopes_label_active
        ON account_team_scopes (account_id, user_id, lower(btrim(label))) WHERE removed_at IS NULL AND entity_id IS NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS account_team_scopes_account_idx
        ON account_team_scopes (account_id) WHERE removed_at IS NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS account_team_scopes_entity_idx
        ON account_team_scopes (entity_id) WHERE removed_at IS NULL AND entity_id IS NOT NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS account_team_scopes_user_idx
        ON account_team_scopes (workspace_id, user_id) WHERE removed_at IS NULL
    `)
    await queryRunner.query(
      `COMMENT ON TABLE account_team_scopes IS 'Zone (périmètre) d''un membre sur un compte : filtre et pré-assigne, ne bloque aucun geste (#4996, Louis 31/10).'`,
    )

    for (const [table, policy] of [
      ['account_team_scopes', 'Members read their workspace account scopes'],
      ['account_team_members', 'Members read their workspace account team'],
    ] as const) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE tablename = '${table}' AND policyname = '${policy}'
          ) THEN
            CREATE POLICY "${policy}"
              ON ${table}
              FOR SELECT
              USING (
                workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
              );
          END IF;
        END $$;
      `)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS account_team_scopes`)
    // La politique de lecture d'account_team_members se retire seule ; la table, jamais.
    await queryRunner.query(`DROP POLICY IF EXISTS "Members read their workspace account team" ON account_team_members`)
  }
}
