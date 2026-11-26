import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4016.L13 (lot V10-E, 17/10) — « FAIT CONFIRMÉ JUSQU'À PREUVE CONTRAIRE ».
 *
 * Un fait confirmé à la main n'est jamais écrasé par une source automatique (`decideFieldWrite`) ;
 * ce refus était muet. Cette table garde la trace de la source qui CONTREDIT : sa valeur, sa source,
 * sa date. Le fait confirmé reste en place sur la fiche ; la contradiction se nomme à côté, et tombe
 * dès qu'une correction humaine la suit (`visibleFieldContradictions`, `@bellum/contracts`).
 *
 * Journal en ajout seul, polymorphe comme `field_provenance` (`entity_type` + `entity_id`), lu
 * toujours depuis un objet déjà résolu. Contrainte NOMMÉE (GA-177), posée AVANT le code qui écrit
 * (GA-11 / GA-12) : `FIELD_CONTRADICTION_SOURCES` — un humain corrige, une estimation ne prouve rien.
 */
export class FieldContradictions1796560184635 implements MigrationInterface {
  public name = 'FieldContradictions1796560184635'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS field_contradictions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid,
        entity_type text NOT NULL,
        entity_id uuid NOT NULL,
        field text NOT NULL,
        value text NOT NULL,
        source text NOT NULL,
        observed_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT field_contradictions_source_check CHECK (source IN ('connector', 'pipeline', 'model'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS field_contradictions_entity_idx
        ON field_contradictions (entity_type, entity_id, observed_at DESC)
    `)
    await queryRunner.query(`ALTER TABLE field_contradictions ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS field_contradictions`)
  }
}
