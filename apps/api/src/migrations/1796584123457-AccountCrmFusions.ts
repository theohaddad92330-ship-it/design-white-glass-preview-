import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4603 — le JOURNAL de la fusion « compte venu du CRM ↔ compte créé par l'analyse », même société.
 *
 * ⚠️ RENVERSEMENT DE DOCTRINE DATÉ — Louis, 26/10/2026, ratifié en connaissance de la règle
 * (`c37_fusion_doublons`, « On PROPOSE une fusion de doublons, on ne fusionne JAMAIS ») : pour CE cas
 * seulement, la paire est fusionnée automatiquement, sans demander. Deux comptes de même nom d'origines
 * quelconques restent PROPOSÉS. Registre : `c142_fusion_auto_compte_crm_compte_analyse`.
 *
 * Table neuve, rien d'existant n'est modifié (additive). Une ligne = une fusion :
 *  - les DEUX identifiants (`kept_id` survit, `absorbed_id` est archivé — jamais supprimé) ;
 *  - la CLÉ qui a décidé (`basis` = `siren` | `name`, `match_key` = le SIREN ou la clé `marketMatchKey`) ;
 *  - ce qui a BOUGÉ (`moved` : par famille, les identifiants déplacés) — la condition du retour arrière :
 *    sans elle, une annulation devrait deviner quelles lignes venaient de la fiche absorbée ;
 *  - l'annulation (`undone_at`, `undone_by`) : la trace reste, la ligne ne s'efface jamais.
 * Contraintes posées AVANT le code qui écrit (GA-11/GA-12).
 */
export class AccountCrmFusions1796584123457 implements MigrationInterface {
  name = 'AccountCrmFusions1796584123457'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS account_crm_fusions (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        workspace_id uuid NOT NULL,
        kept_id uuid NOT NULL,
        absorbed_id uuid NOT NULL,
        basis text NOT NULL,
        match_key text NOT NULL,
        moved jsonb NOT NULL DEFAULT '{}'::jsonb,
        merged_at timestamptz NOT NULL DEFAULT now(),
        undone_at timestamptz,
        undone_by uuid,
        CONSTRAINT account_crm_fusions_basis_check CHECK (basis IN ('siren', 'name')),
        CONSTRAINT account_crm_fusions_not_self_check CHECK (kept_id <> absorbed_id),
        CONSTRAINT account_crm_fusions_moved_shape_check CHECK (jsonb_typeof(moved) = 'object'),
        CONSTRAINT account_crm_fusions_key_check CHECK (length(btrim(match_key)) > 0)
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS account_crm_fusions_live_absorbed_uidx ON account_crm_fusions (workspace_id, absorbed_id) WHERE undone_at IS NULL`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS account_crm_fusions_kept_idx ON account_crm_fusions (workspace_id, kept_id)`,
    )
    // Écrite et lue par le service (rôle serveur) seulement : aucune politique = aucun accès client.
    await queryRunner.query(`ALTER TABLE account_crm_fusions ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS account_crm_fusions`)
  }
}
