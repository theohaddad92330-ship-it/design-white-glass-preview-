import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `storage_objects.content_sha256` — #2438.7.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * `StorageService.put` ne conservait AUCUNE empreinte des octets qu'il range —
 * seulement leur taille et leur type déclaré (sur l'extension). Sans empreinte,
 * rien ne permet de vérifier après coup que les octets rendus sont bien ceux
 * déposés, ni de repérer deux dépôts du même contenu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA MIGRATION AJOUTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une colonne NULLABLE, additive : `content_sha256`. `StorageService.put` la
 * renseigne pour CHAQUE nouveau dépôt (SHA-256 des octets, calculé une fois,
 * jamais une lecture de contenu métier — un hachage ne LIT rien, il résume).
 * `null` pour toute ligne écrite AVANT cette migration : aucun backfill, les
 * octets d'origine ne sont pas relus pour fabriquer une empreinte a posteriori
 * — même prudence que `ManualBillingInvoiceDisputeAndReminders1791823551000`
 * (« aucune relance déjà envoyée à la main n'est écrite nulle part »).
 *
 * ⚠️ Ceci N'EST PAS un antivirus ni une détection de macros : `storage.service.ts`
 * garde sa doctrine (31/08/2026, nuancée le 22/09 pour la SIGNATURE de forme
 * seulement, #2438.7). Une empreinte ne dit rien du contenu, seulement son
 * identité octet pour octet.
 *
 * ⚠️ Horodatage repris à l'intégration (GA-372) : l'original (1790122303886,
 * posé par l'agent précédent au plafond) reculait sous le maximum déjà en
 * service (1795999506893, `CvVersionValidation`) — TypeORM l'aurait exécuté
 * AVANT des migrations dont il dépend sur une base fraîche. Repris via
 * `pnpm --filter @bellum/api migration:next`, strictement au-dessus, aucun
 * changement de contenu.
 */
export class StorageObjectContentHash1795999512332 implements MigrationInterface {
  name = 'StorageObjectContentHash1795999512332'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE storage_objects
        ADD COLUMN IF NOT EXISTS content_sha256 text
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE storage_objects
        DROP COLUMN IF EXISTS content_sha256
    `)
  }
}
