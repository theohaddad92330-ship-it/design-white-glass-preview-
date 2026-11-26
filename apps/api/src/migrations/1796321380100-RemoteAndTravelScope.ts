import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2036.2 (LAU-FINAL, modèle de territoire à 7 axes, #2847) — UNE colonne
 * ADDITIVE sur `esn_profiles` : le remote accepté et les déplacements,
 * distincts de `geo_zones` (la zone géographique visée) — même principe que
 * `growth_target_zones` (#2036.9, migration 1794291845307) : deux axes du
 * territoire qui ne se fusionnent jamais dans la même liste.
 *
 * `#2847` cite 7 axes attendus par #2036 (agences/régions/pays séparés,
 * remote + déplacements, secteurs locaux, comptes réservés/groupe,
 * règles territoriales, périmètre exclusif/partagé, « je peux intervenir »).
 * Les 6 autres restent un changement de MODÈLE (nouvelles tables/écran), pas
 * une colonne — cette migration ne porte QUE le second axe, qui est additif.
 *
 * Additive et idempotente, comme `1794291845307` : `text[] NOT NULL DEFAULT
 * '{}'`, le questionnaire ne bloque jamais sur une réponse absente.
 */
export class RemoteAndTravelScope1796321380100 implements MigrationInterface {
  name = 'RemoteAndTravelScope1796321380100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS remote_and_travel_scope text[] NOT NULL DEFAULT '{}';
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS remote_and_travel_scope;
    `)
  }
}
