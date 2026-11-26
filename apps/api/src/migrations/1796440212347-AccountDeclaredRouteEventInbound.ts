import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3278.1 (décision Louis 11/10/2026) — les OBJETS SOURCES des deux dernières routes
 * commerciales : « événement ou communauté » (un contact noué dans un salon, un meetup, une
 * communauté) et « inbound / contenu » (un compte venu à nous par un contenu). Comme les six
 * critères de M11 (`1796437901101`), un fait DÉCLARÉ à la main sur la fiche (« Compléter la
 * fiche »), relu par Laura via le pont d'accès.
 *
 * ⚠️ NULLABLE, sans CHECK ni backfill : texte libre, `NULL` = non déclaré — la route reste
 * alors non nommée, jamais devinée. Ajout seulement (GA-11/12 : la colonne existe avant le code
 * qui l'écrit).
 */
export class AccountDeclaredRouteEventInbound1796440212347 implements MigrationInterface {
  public name = 'AccountDeclaredRouteEventInbound1796440212347'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        ADD COLUMN IF NOT EXISTS declared_route_event text,
        ADD COLUMN IF NOT EXISTS declared_route_inbound text
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
