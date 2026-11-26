import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3921.a / #3921.b (lot M03, 09/10/2026) — le RELEVÉ Sirene, une ligne par jour.
 *
 * `new_establishments()` (IA) compare deux relevés — et rien ne gardait celui
 * d'hier : la primitive était juste, testée, et sans appelant. `establishments`
 * porte le relevé du jour (SIRET, actif, début de période, commune) ; le job
 * `registry` de la veille le relit le lendemain pour en tirer les ouvertures.
 *
 * `headcount_range` — l'effectif (tranche INSEE) MESURÉ ce jour-là. Jusqu'ici
 * `headcount_tranche` n'existait qu'au présent, écrasée à chaque résolution :
 * « en hausse » n'avait rien à comparer. Une ligne par relevé, c'est l'historique
 * qui manquait — `NULL` = non mesuré ce jour-là, jamais un zéro. `source` dit
 * QUI a relevé (la veille des comptes suivis, ou la résolution du référentiel
 * ESN) ; `establishments` est `NULL` quand le relevé n'a lu que l'effectif.
 *
 * PARTAGÉE (registre de portées : `shared`, audience `market`) : registre
 * public, clé = SIREN.
 */
export class SireneSnapshots1796437900302 implements MigrationInterface {
  public name = 'SireneSnapshots1796437900302'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sirene_snapshots (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        siren           text NOT NULL CHECK (siren ~ '^[0-9]{9}$'),
        observed_on     date NOT NULL,
        source          text NOT NULL DEFAULT 'registry_watch',
        headcount_range text,
        establishments  jsonb,
        collected_at    timestamptz NOT NULL DEFAULT now(),
        -- GA-177 — named, so GA-12 can match it against its TypeScript list.
        CONSTRAINT sirene_snapshots_source_check CHECK (source IN ('registry_watch', 'esn_directory')),
        CONSTRAINT sirene_snapshots_unique UNIQUE (siren, observed_on)
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS sirene_snapshots_siren_idx ON sirene_snapshots (siren, observed_on DESC)
    `)
    await queryRunner.query(`ALTER TABLE sirene_snapshots ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS sirene_snapshots`)
  }
}
