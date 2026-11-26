import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2117.9 (épopée #2813) — le nom commercial d'un compte, quand il diffère de
 * la raison sociale (`company_name`). Bloqué depuis le tri du 24/09/2026 :
 * aucune source (Apollo/Pappers/Firecrawl) ne produit ce champ, l'écrire à
 * partir d'une collecte serait une donnée inventée (doctrine « jamais de
 * donnée fictive »).
 *
 * Même geste que `accounts.phone` / `accounts.address` (migration
 * `1789301274613-CrmAtsSocle`) : un champ de fiche qu'AUCUNE collecte ne
 * remplit, saisi à la main, corrigeable via `RecordEditService` — la
 * tranche minimale verticale de « donnée absente » (méthode du 26/09).
 */
export class AccountTradeName1796321725100 implements MigrationInterface {
  public name = 'AccountTradeName1796321725100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS trade_name text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS trade_name`)
  }
}
