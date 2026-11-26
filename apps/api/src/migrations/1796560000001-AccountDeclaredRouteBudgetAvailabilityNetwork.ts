import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3278.2b (décision Louis 15/10/2026) — budget, disponibilité et réseau existant sont des critères
 * DÉCLARATIFS de la route commerciale : le commercial les saisit sur la fiche du compte (« Compléter la
 * fiche »), Laura les cite tels quels. Même forme que les huit colonnes `declared_route_*` précédentes.
 *
 * ⚠️ NULLABLE, sans CHECK ni backfill : texte libre, `NULL` = « non renseigné », jamais deviné. Ajout
 * seulement (GA-11/12 : la colonne existe avant le code qui l'écrit).
 */
export class AccountDeclaredRouteBudgetAvailabilityNetwork1796560000001 implements MigrationInterface {
  public name = 'AccountDeclaredRouteBudgetAvailabilityNetwork1796560000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        ADD COLUMN IF NOT EXISTS declared_route_budget text,
        ADD COLUMN IF NOT EXISTS declared_route_availability text,
        ADD COLUMN IF NOT EXISTS declared_route_network text
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
