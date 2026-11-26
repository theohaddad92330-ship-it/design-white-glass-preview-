import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #219.6 (#3231, lot X50) — CLIENT INTERNE : la SOURCE du signal.
 *
 * Aucune donnée collectée ne dit qu'un compte est une direction interne qui
 * sert plusieurs métiers (détecter par ressemblance de texte inventerait une
 * preuve). Le commercial le DÉCLARE sur la fiche compte ; Laura et le plan
 * (`apps/ia/app/services/internal_client.py`) distinguent alors commanditaire,
 * utilisateur, entité juridique et client final au lieu d'appeler chaque métier
 * « client externe ».
 *
 * ⚠️ LA CONTRAINTE EST POSÉE AVANT LE CODE QUI ÉCRIT LA VALEUR (GA-11 / GA-12).
 * ⚠️ NULLABLE : `NULL` = non déclaré, jamais backfillé par une hypothèse.
 */
export class AccountDeclaredInternalClientMode1796424417731 implements MigrationInterface {
  public name = 'AccountDeclaredInternalClientMode1796424417731'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        ADD COLUMN IF NOT EXISTS declared_internal_client_mode text
    `)

    await queryRunner.query(`
      ALTER TABLE accounts
        DROP CONSTRAINT IF EXISTS accounts_declared_internal_client_mode_check
    `)

    await queryRunner.query(`
      ALTER TABLE accounts
        ADD CONSTRAINT accounts_declared_internal_client_mode_check
        CHECK (declared_internal_client_mode IS NULL OR declared_internal_client_mode IN (
          'internal_service', 'external_buyer'
        ))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
