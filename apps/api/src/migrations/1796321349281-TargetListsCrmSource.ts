import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Épopée #2853 (#2157.7) — « Créer une cible » depuis le connecteur CRM.
 *
 * Porte « ajout seulement » (GA-08) : `'crm'` va EN FIN des deux
 * énumérations, après `'laura'` (migration `1796321349137-TargetListsLauraSource`).
 * La contrainte s'élargit ICI, avant le code web qui écrira la valeur
 * (GA-11 / GA-12).
 *
 * Une liste `source: 'crm'` naît d'un compte dont le connecteur CRM branché
 * de l'utilisateur a confirmé la présence (`CrmPresenceBadge`, `matched:
 * true`) — jamais du seul fait qu'un CRM soit connecté : sans clé/connecteur
 * ou sans correspondance, l'action reste absente (no-op strict), pas
 * proposée avec une donnée devinée.
 */
export class TargetListsCrmSource1796321349281 implements MigrationInterface {
  name = 'TargetListsCrmSource1796321349281'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE target_lists DROP CONSTRAINT IF EXISTS target_lists_source_check`)
    await queryRunner.query(`
      ALTER TABLE target_lists ADD CONSTRAINT target_lists_source_check
        CHECK (source IN ('manual', 'discover', 'import', 'analysis', 'saved_search', 'laura', 'crm'))
    `)
    await queryRunner.query(
      `ALTER TABLE target_list_items DROP CONSTRAINT IF EXISTS target_list_items_provenance_check`,
    )
    await queryRunner.query(`
      ALTER TABLE target_list_items ADD CONSTRAINT target_list_items_provenance_check
        CHECK (provenance IN ('manual', 'discover', 'import', 'analysis', 'laura', 'crm'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
}
