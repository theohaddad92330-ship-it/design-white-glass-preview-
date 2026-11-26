import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4016 L6 (décision Louis 11/10/2026) — LA FUSION AUTOMATIQUE DES DOUBLONS ≥ 0,99,
 * CÔTÉ BELLUM SEULEMENT, RÉVERSIBLE.
 *
 * ⚠️⚠️ Renversement daté de `c37_fusion_doublons` (« on propose, on ne fusionne
 * jamais »). Trois choses en base, posées AVANT le code qui les écrit
 * (GA-11/GA-12) :
 *
 *  1. `duplicate_pairs.decision` accepte `auto_merged` — ajouté EN FIN (GA-08) ;
 *     la ligne de la paire EST le journal de la fusion.
 *  2. `duplicate_pairs.absorbed_id` (quelle fiche a rejoint l'autre),
 *     `undone_at` / `undone_by` (qui a annulé, et quand) : le journal se lit,
 *     et l'annulation laisse une trace — jamais une ligne effacée.
 *  3. `contacts.merged_into_id` : la fiche absorbée pointe vers celle qui
 *     survit. Elle est aussi mise de côté par `deleted_at` (suppression
 *     RÉVERSIBLE, T0) — c'est ce qui la sort de toutes les listes sans rien
 *     effacer. L'annulation remet les deux colonnes à NULL.
 *
 * Rien ici ne touche le CRM du client : la fusion est une écriture BellumAI.
 */
export class DuplicateAutoMerge1796440163847 implements MigrationInterface {
  name = 'DuplicateAutoMerge1796440163847'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE duplicate_pairs DROP CONSTRAINT IF EXISTS duplicate_pairs_decision_check`)
    await queryRunner.query(`
      ALTER TABLE duplicate_pairs ADD CONSTRAINT duplicate_pairs_decision_check
        CHECK (decision IN ('pending', 'merged', 'dismissed', 'auto_merged'))
    `)
    await queryRunner.query(`ALTER TABLE duplicate_pairs ADD COLUMN IF NOT EXISTS absorbed_id uuid`)
    await queryRunner.query(`ALTER TABLE duplicate_pairs ADD COLUMN IF NOT EXISTS undone_at timestamptz`)
    await queryRunner.query(`ALTER TABLE duplicate_pairs ADD COLUMN IF NOT EXISTS undone_by uuid`)
    // Une fusion automatique NOMME toujours la fiche absorbée — et elle est
    // l'une des deux de la paire, jamais une troisième.
    await queryRunner.query(
      `ALTER TABLE duplicate_pairs DROP CONSTRAINT IF EXISTS duplicate_pairs_auto_merge_absorbed_check`,
    )
    await queryRunner.query(`
      ALTER TABLE duplicate_pairs ADD CONSTRAINT duplicate_pairs_auto_merge_absorbed_check
        CHECK (
          absorbed_id IS NULL
          OR absorbed_id = left_id
          OR absorbed_id = right_id
        )
    `)
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS merged_into_id uuid`)
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_merged_into_not_self_check`)
    await queryRunner.query(`
      ALTER TABLE contacts ADD CONSTRAINT contacts_merged_into_not_self_check
        CHECK (merged_into_id IS NULL OR merged_into_id <> id)
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS contacts_merged_into_idx ON contacts (merged_into_id) WHERE merged_into_id IS NOT NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS contacts_merged_into_idx`)
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_merged_into_not_self_check`)
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS merged_into_id`)
    await queryRunner.query(
      `ALTER TABLE duplicate_pairs DROP CONSTRAINT IF EXISTS duplicate_pairs_auto_merge_absorbed_check`,
    )
    await queryRunner.query(`ALTER TABLE duplicate_pairs DROP COLUMN IF EXISTS undone_by`)
    await queryRunner.query(`ALTER TABLE duplicate_pairs DROP COLUMN IF EXISTS undone_at`)
    await queryRunner.query(`ALTER TABLE duplicate_pairs DROP COLUMN IF EXISTS absorbed_id`)
    // Une valeur déjà écrite ne se perd pas : les fusions automatiques
    // redeviennent des paires écartées avant que la contrainte se resserre.
    await queryRunner.query(`UPDATE duplicate_pairs SET decision = 'dismissed' WHERE decision = 'auto_merged'`)
    await queryRunner.query(`ALTER TABLE duplicate_pairs DROP CONSTRAINT IF EXISTS duplicate_pairs_decision_check`)
    await queryRunner.query(`
      ALTER TABLE duplicate_pairs ADD CONSTRAINT duplicate_pairs_decision_check
        CHECK (decision IN ('pending', 'merged', 'dismissed'))
    `)
  }
}
