import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Domaine d'offre du vendeur (PDF6 §1 — « Bellum ne doit pas être enfermé dans
 * le vocabulaire IT/data ») : colonne `offer_domain` sur `esn_profiles`,
 * sélecteur « Domaine d'offre » du profil vendeur. Valeurs = enum contracts
 * `OFFER_DOMAINS` (esn_it, finance, supply_chain, product_design, pmo, rh,
 * generic) — TEXT libre côté SQL (pas de CHECK : l'enum vit dans les contracts
 * + packs IA, ajouter un domaine ne demande pas de migration).
 *
 * NULL = défaut `esn_it` → prompts IA byte-identiques (goldens IA). Additif +
 * idempotent (`ADD COLUMN IF NOT EXISTS`, nullable, aucun backfill). RLS inchangé.
 */
export class EsnProfileOfferDomain1785960000000 implements MigrationInterface {
  public name = 'EsnProfileOfferDomain1785960000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS offer_domain TEXT`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
