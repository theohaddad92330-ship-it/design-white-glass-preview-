import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2297.51 — L'ARCHIVE DES COORDONNÉES ENRICHIES (décision Louis 19/09/2026).
 *
 * Trois ans après le dernier contact ou la dernière activité, les coordonnées
 * qu'un enrichissement a apportées sont ARCHIVÉES : plus affichées, plus
 * exportées, jamais supprimées (« on archive, on ne supprime pas » — un fait
 * périmé redevient inconnu). Le balayage qui les déplace vit dans
 * `PrivacyRetentionService.sweepStaleEnrichedContacts`.
 *
 *  - `enrichment_archive` (jsonb) — les valeurs retirées de la lecture. L'entité
 *    la déclare `select: false` : aucun `find` ne la charge, donc aucun écran,
 *    aucun export, aucun envoi ne peut la relire par accident. Seule une
 *    demande d'effacement RGPD y touche encore (`anonymizeContacts`), pour la
 *    vider réellement.
 *  - `enrichment_archived_at` (timestamptz) — la date du geste, que la fiche
 *    AFFICHE : une coordonnée archivée ne se lit jamais comme « jamais
 *    cherchée ».
 *
 * Purement additive : deux colonnes NULL, sans défaut — NULL = rien d'archivé.
 */
export class ContactEnrichmentArchive1789809858927 implements MigrationInterface {
  name = 'ContactEnrichmentArchive1789809858927'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS enrichment_archive jsonb`)
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS enrichment_archived_at timestamptz`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ⚠️ Revenir en arrière PERD les valeurs archivées : à ne jouer que sur une
    // base où le balayage n'a encore rien archivé.
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS enrichment_archived_at`)
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS enrichment_archive`)
  }
}
