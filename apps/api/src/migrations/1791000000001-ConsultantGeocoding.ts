import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `consultants.latitude` / `consultants.longitude` — le rayon en km, en vrai
 * (écran Vivier, PDF-22 §01, décision de Louis du 31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES COLONNES SONT, ET CE QU'ELLES NE SONT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le tiroir « Plus de filtres » promettait un rayon autour d'une ville depuis
 * le socle, sans qu'aucune coordonnée n'existe pour un talent — la seule
 * autre table à en porter est `account_sites`, pour une carte, sans lien avec
 * le vivier (`talentAdvancedFilters.ts`). Louis a tranché : géocoder via la
 * Base Adresse Nationale (`api-adresse.data.gouv.fr/search`) — publique,
 * gratuite, SANS CLÉ, donc aucune clé côté client ni côté serveur à gérer.
 *
 * `double precision` nullable, sans défaut : `null` pour toute fiche
 * existante, jamais une coordonnée devinée. Une fiche non géocodée SORT du
 * filtre par rayon — elle ne vaut jamais « à 0 km », ce qui la ferait
 * apparaître comme la plus proche de partout.
 *
 * Aucune donnée existante n'est touchée : `null` partout, comme le veut
 * « jamais de donnée fictive ».
 */
export class ConsultantGeocoding1791000000001 implements MigrationInterface {
  public name = 'ConsultantGeocoding1791000000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS latitude double precision`)
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS longitude double precision`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS longitude`)
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS latitude`)
  }
}
