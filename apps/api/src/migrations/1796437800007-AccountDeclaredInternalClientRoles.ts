import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #219.6 (#3231, lot J05) — CLIENT INTERNE : les QUATRE rôles se NOMMENT.
 *
 * `declared_internal_client_mode` dit qu'un compte est une direction interne ; il ne
 * dit pas QUI est le commanditaire, les utilisateurs, l'entité juridique, le client
 * final. Le commercial les nomme à la main sur la fiche (texte libre, en clair) ;
 * Laura et le plan les lisent (`apps/ia/app/services/internal_client.py`).
 *
 * ⚠️ NULLABLE, sans CHECK : texte libre, `NULL` = non nommé, jamais backfillé par une
 * hypothèse (aucune détection par ressemblance de texte : ce serait inventer une preuve).
 */
export class AccountDeclaredInternalClientRoles1796437800007 implements MigrationInterface {
  public name = 'AccountDeclaredInternalClientRoles1796437800007'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        ADD COLUMN IF NOT EXISTS declared_internal_sponsor text,
        ADD COLUMN IF NOT EXISTS declared_internal_users text,
        ADD COLUMN IF NOT EXISTS declared_legal_entity text,
        ADD COLUMN IF NOT EXISTS declared_end_client text
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
