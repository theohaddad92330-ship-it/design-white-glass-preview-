import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Lot 762 P5 (décision Louis 31/10) — un deal CRM dont la société n'a NI id société connu, NI SIREN, NI domaine
 * n'apparaissait sous AUCUN compte. Dernier recours : le NOM normalisé de la société CRM, retenu UNIQUEMENT s'il
 * est univoque dans l'espace (`resolveDealAccount`). Deux colonnes touchées, ADDITIF :
 *
 *  - `crm_deal_facts.company_name` (nullable) — la raison sociale lue chez le fournisseur ;
 *  - le CHECK de `account_link_basis` s'ÉLARGIT à 'name' AVANT le code qui l'écrit (GA-11 / GA-12).
 */
export class CrmDealFactsCompanyNameLink1796597841263 implements MigrationInterface {
  public name = 'CrmDealFactsCompanyNameLink1796597841263'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE crm_deal_facts ADD COLUMN IF NOT EXISTS company_name text`)
    await queryRunner.query(
      `ALTER TABLE crm_deal_facts DROP CONSTRAINT IF EXISTS crm_deal_facts_account_link_basis_check`,
    )
    await queryRunner.query(`
      ALTER TABLE crm_deal_facts
        ADD CONSTRAINT crm_deal_facts_account_link_basis_check
        CHECK (account_link_basis IS NULL OR account_link_basis IN ('crm_company_id', 'siren', 'domain', 'name'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE crm_deal_facts SET account_link_basis = NULL, account_id = NULL WHERE account_link_basis = 'name'`,
    )
    await queryRunner.query(
      `ALTER TABLE crm_deal_facts DROP CONSTRAINT IF EXISTS crm_deal_facts_account_link_basis_check`,
    )
    await queryRunner.query(`
      ALTER TABLE crm_deal_facts
        ADD CONSTRAINT crm_deal_facts_account_link_basis_check
        CHECK (account_link_basis IS NULL OR account_link_basis IN ('crm_company_id', 'siren', 'domain'))
    `)
    await queryRunner.query(`ALTER TABLE crm_deal_facts DROP COLUMN IF EXISTS company_name`)
  }
}
