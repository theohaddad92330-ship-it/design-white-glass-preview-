import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1612.1 / #1638.1 — sur quelle(s) techno(s) une preuve porte (PDF 2 §12).
 *
 * Deux issues du 06/09 demandaient la MÊME chose : afficher « Compatibilité
 * technique observée » quand une preuve (un REX, une référence) et
 * l'environnement technique observé du compte (`AccountMarketContext.observed_stack`,
 * porté par la mémoire marché) partagent au moins deux technologies.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENT CETTE DONNÉE ?
 * ─────────────────────────────────────────────────────────────────────────────
 * De la personne qui capitalise la preuve, au moment où elle la déclare —
 * exactement comme `proofs.sector`, déjà en base et déjà saisi à la main.
 * Rien dans le pipeline ne peut deviner qu'une preuve « Migration de 400 To en
 * 6 mois » porte sur Java et AWS : ce serait une extraction non faite, pas un
 * champ. `technologies` est donc un tableau NON NULL par défaut vide, jamais
 * déduit d'un texte libre.
 *
 * Additive uniquement — porte « ajout seulement » (GA-11/GA-12) : une colonne
 * neuve, aucun renommage, aucune contrainte resserrée sur une colonne
 * existante. Même discipline que `1790020847361-ProjectDomainContext` pour
 * `application_sector_codes` : `text[] NOT NULL DEFAULT '{}'`, jamais nullable
 * — une preuve sans technologie déclarée est une liste VIDE, pas une absence.
 */
export class ProofTechnologies1792143857211 implements MigrationInterface {
  name = 'ProofTechnologies1792143857211'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE proofs ADD COLUMN IF NOT EXISTS technologies text[] NOT NULL DEFAULT '{}'`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE proofs DROP COLUMN IF EXISTS technologies`)
  }
}
