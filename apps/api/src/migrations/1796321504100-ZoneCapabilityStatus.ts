import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2036.8 (LAU-FINAL, modèle de territoire à 7 axes, #2847) — UNE colonne
 * ADDITIVE sur `esn_profiles` : la posture territoriale déclarée (capacité
 * avérée / relations existantes / intention), distincte de `geo_zones` et de
 * `remote_and_travel_scope` — même principe que `growth_target_zones`
 * (#2036.9) et `remote_and_travel_scope` (#2036.2, migration 1796321380100) :
 * des axes du territoire qui ne se fusionnent jamais dans la même liste.
 *
 * `#2847` cite 7 axes attendus par #2036. Les 6 autres restent un changement
 * de MODÈLE (nouvelles tables/écran), pas une colonne — cette migration ne
 * porte QUE le 7e axe, dans sa forme v1 additive (posture déclarée au niveau
 * du territoire pris dans son ensemble, pas encore un croisement par zone —
 * tranché sans Louis, lot `feat/reste-r4-26-09`).
 *
 * Additive et idempotente, comme `1796321380100` : `text[] NOT NULL DEFAULT
 * '{}'`, le questionnaire ne bloque jamais sur une réponse absente.
 */
export class ZoneCapabilityStatus1796321504100 implements MigrationInterface {
  name = 'ZoneCapabilityStatus1796321504100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS zone_capability_status text[] NOT NULL DEFAULT '{}';
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS zone_capability_status;
    `)
  }
}
