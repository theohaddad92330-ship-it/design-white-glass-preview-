import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2120.57 / #2297.23 — la durée d'un enrichissement se MESURE.
 *
 * Mesuré en production le 19/09 (recette R23) : le dialogue de confirmation
 * affichait « Durée : non mesurée » faute de source serveur. Cette table est
 * la source : une ligne par appel `ContactsService.enrichContact` qui n'a PAS
 * levé (succès ou « rien trouvé » — un échec technique n'y entre jamais).
 *
 * SAFE : nouvelle table isolée, aucune dépendance FK, aucun changement sur les
 * tables existantes. Pas de `workspace_id` ni `user_id` par construction :
 * c'est une latence du PRODUIT, jamais une donnée d'espace (doctrine
 * `c64_analytique_produit`) — la CHECK élargit AVANT le code qui écrit
 * (GA-11/GA-12) : `duration_ms >= 0`.
 */
export class EnrichmentDurationSamples1789816319703 implements MigrationInterface {
  public name = 'EnrichmentDurationSamples1789816319703'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS enrichment_duration_samples (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        duration_ms integer NOT NULL,
        measured_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT enrichment_duration_samples_duration_ms_check CHECK (duration_ms >= 0)
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS enrichment_duration_samples_measured_at_idx
      ON enrichment_duration_samples (measured_at DESC)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS enrichment_duration_samples_measured_at_idx`)
    await queryRunner.query(`DROP TABLE IF EXISTS enrichment_duration_samples`)
  }
}
