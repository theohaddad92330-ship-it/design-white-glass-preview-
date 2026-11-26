import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2120.57 (b) — mesuré en production le 20/09 : le dialogue affichait
 * « Durée estimée : environ 0 s ». Une réponse « rien trouvé » revient
 * quasi instantanément, quand un enrichissement qui ABOUTIT prend 30 à 85 s
 * (`contacts.module.ts`) — les deux tombaient dans la même médiane, qui ne
 * répondait donc plus à la question de l'écran (« combien de temps vais-je
 * attendre ? »). Le fait même que la médiane observée soit tombée sous
 * 500 ms sur 7 échantillons prouve que les réponses « rien trouvé »
 * DOMINAIENT cette fenêtre (un enrichissement abouti pèse 30 000-85 000 ms —
 * la médiane de 7 valeurs ne peut tomber sous 500 ms que si au moins 4
 * d'entre elles le sont aussi).
 *
 * `found` distingue les deux SANS supprimer l'enregistrement du « rien
 * trouvé » (toujours écrit — les deux restent des RÉPONSES du fournisseur,
 * pas des incidents) : `EnrichmentDurationService.estimate()` filtre
 * désormais sur `found = true`, la question posée par l'écran.
 *
 * NULLABLE, SANS DÉFAUT : une ligne déjà écrite n'a pas cette distinction —
 * elle reste `NULL`, donc exclue de `estimate()` par construction
 * (`WHERE found = true` n'attrape jamais un NULL) plutôt que reclassée
 * `true` par une hypothèse. SAFE : ADD COLUMN nullable sur une table sans
 * FK ni RLS, aucun backfill, aucun changement sur les lignes existantes.
 */
export class EnrichmentDurationSamplesFound1789903923955 implements MigrationInterface {
  public name = 'EnrichmentDurationSamplesFound1789903923955'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE enrichment_duration_samples
      ADD COLUMN IF NOT EXISTS found boolean
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE enrichment_duration_samples DROP COLUMN IF EXISTS found`)
  }
}
