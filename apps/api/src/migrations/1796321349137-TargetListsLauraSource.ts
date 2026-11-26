import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Épopée #2853 (#2157.1) — « Créer une cible » depuis Laura.
 *
 * Porte « ajout seulement » (GA-08) : `'laura'` va EN FIN des deux
 * énumérations existantes, aucune valeur ne bouge ni ne disparaît. La
 * contrainte s'élargit ICI, avant le code IA/web qui écrira la valeur
 * (GA-11 / GA-12) — `check-constraints-cover-enums.spec.ts` la lit en
 * lisant la DERNIÈRE déclaration de chaque contrainte dans les migrations.
 *
 * `'laura'` — pas `'chat'` — parce que `analysis_batches_source_check`
 * (migration `1796000544454-AnalysisBatches`) nomme déjà cette même surface
 * ainsi : une cible proposée pendant une conversation naît d'un geste
 * DIFFÉRENT de « Analyser » (`'analysis'`, dossier de compte déjà ouvert) —
 * les deux surfaces sont routées séparément dans #2853, elles ne partagent
 * pas leur provenance.
 */
export class TargetListsLauraSource1796321349137 implements MigrationInterface {
  name = 'TargetListsLauraSource1796321349137'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE target_lists DROP CONSTRAINT IF EXISTS target_lists_source_check`)
    await queryRunner.query(`
      ALTER TABLE target_lists ADD CONSTRAINT target_lists_source_check
        CHECK (source IN ('manual', 'discover', 'import', 'analysis', 'saved_search', 'laura'))
    `)
    await queryRunner.query(
      `ALTER TABLE target_list_items DROP CONSTRAINT IF EXISTS target_list_items_provenance_check`,
    )
    await queryRunner.query(`
      ALTER TABLE target_list_items ADD CONSTRAINT target_list_items_provenance_check
        CHECK (provenance IN ('manual', 'discover', 'import', 'analysis', 'laura'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Le `down` ne retire QUE la contrainte élargie — aucune colonne, aucune
    // table : elles appartiennent aux migrations précédentes.
    await queryRunner.query(`ALTER TABLE target_lists DROP CONSTRAINT IF EXISTS target_lists_source_check`)
    await queryRunner.query(`
      ALTER TABLE target_lists ADD CONSTRAINT target_lists_source_check
        CHECK (source IN ('manual', 'discover', 'import', 'analysis', 'saved_search'))
    `)
    await queryRunner.query(
      `ALTER TABLE target_list_items DROP CONSTRAINT IF EXISTS target_list_items_provenance_check`,
    )
    await queryRunner.query(`
      ALTER TABLE target_list_items ADD CONSTRAINT target_list_items_provenance_check
        CHECK (provenance IN ('manual', 'discover', 'import', 'analysis'))
    `)
  }
}
