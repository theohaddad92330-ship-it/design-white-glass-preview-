import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3278.2 (lot M11 09/10) — les SIX critères de la route commerciale qui n'ont
 * aucune source structurée (périmètre de la mission, objectifs du compte,
 * rôles disponibles côté client, partenaires déjà identifiés, historique de la
 * relation, fenêtre de temps) : un objet de saisie par critère, déclaré à la
 * main sur la fiche (« Compléter la fiche »). Laura les relit par le pont
 * d'accès et les cite tels quels.
 *
 * ⚠️ NULLABLE, sans CHECK ni backfill : texte libre, `NULL` = non déclaré — le
 * critère reste alors NOMMÉ non évalué, jamais une valeur devinée.
 */
export class AccountDeclaredRouteCriteria1796437901101 implements MigrationInterface {
  public name = 'AccountDeclaredRouteCriteria1796437901101'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        ADD COLUMN IF NOT EXISTS declared_route_scope text,
        ADD COLUMN IF NOT EXISTS declared_route_objectives text,
        ADD COLUMN IF NOT EXISTS declared_route_available_roles text,
        ADD COLUMN IF NOT EXISTS declared_route_partners text,
        ADD COLUMN IF NOT EXISTS declared_route_history text,
        ADD COLUMN IF NOT EXISTS declared_route_timing text
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
