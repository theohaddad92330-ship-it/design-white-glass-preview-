import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2284.67-.69 (tranche 2) — LA CORRECTION D'IDENTITÉ, VERSIONNÉE PAR L'ESPACE.
 *
 * Le verdict calculé (`raw_analysis.entity_resolution`, écrit par
 * `apps/ia/app/services/entity_resolution.py`) reste le CALCUL : il n'est jamais
 * réécrit. Ce que l'humain répond à la carte « Entité résolue » — « c'est bien
 * celle-ci » / « ce n'est pas celle-ci » — vit ici, et se SUPERPOSE à la lecture
 * (`applyEntityResolutionCorrections`, `@bellum/contracts`).
 *
 * · **Versionnée** (.68) : une LIGNE PAR GESTE, jamais mise à jour ni supprimée.
 *   La plus haute version gagne — une correction humaine gagne toujours, quelle
 *   que soit sa date (.67) — et les précédentes restent lisibles : on archive,
 *   on ne supprime pas. L'unicité `(workspace_id, account_id, version)` fait
 *   échouer deux gestes simultanés plutôt que d'en garder deux sous le même
 *   numéro.
 * · **Scopée à l'espace** (.69) : `workspace_id` NOT NULL. Les espaces sont des
 *   ESN concurrentes ; la décision de l'une n'est jamais la vérité d'une autre,
 *   et aucun référentiel partagé n'est touché.
 * · **Pas de confiance** : une décision humaine n'est pas probable, elle est
 *   prise (doctrine « aucune probabilité », GA-64).
 *
 * PORTE « AJOUT SEULEMENT » : création pure, `CHECK` posés DÈS LA CRÉATION — la
 * contrainte précède le code qui écrit la valeur (GA-11 / GA-12).
 */
export class EntityResolutionCorrections1796001468388 implements MigrationInterface {
  name = 'EntityResolutionCorrections1796001468388'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS entity_resolution_corrections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        version integer NOT NULL,
        decision text NOT NULL,
        target_name text NOT NULL,
        target_siren text NULL,
        note text NULL,
        decided_by uuid NOT NULL,
        decided_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT entity_resolution_corrections_decision_check CHECK (decision IN ('confirmed', 'rejected')),
        CONSTRAINT entity_resolution_corrections_siren_check CHECK (target_siren IS NULL OR target_siren ~ '^[0-9]{9}$'),
        CONSTRAINT entity_resolution_corrections_version_check CHECK (version >= 1)
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS entity_resolution_corrections_version_unique ON entity_resolution_corrections (workspace_id, account_id, version)`,
    )
    await queryRunner.query(`ALTER TABLE entity_resolution_corrections ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS entity_resolution_corrections`)
  }
}
