import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3918.a (lot M01, 09/10/2026) — la jointure deal CRM → compte, ADDITIVE.
 *
 * `crm_deal_facts` ne portait aucun lien vers `accounts` : les signaux
 * `affaire_perdue` / `affaire_dormante` / `affaire_renouvellement` n'avaient
 * pour sujet que le deal, et aucun écran ne pouvait les montrer sous un
 * compte. Rattacher par le NOM de la société serait un rapprochement par
 * homonymie, refusé (#2284.28). Trois colonnes de clé, lues chez le
 * fournisseur au moment de la synchronisation :
 *
 *  - `company_external_id` — l'id de la société associée au deal CHEZ LE
 *    FOURNISSEUR (HubSpot company id, Salesforce AccountId) ;
 *  - `company_siren` — son SIREN quand le portail le porte ;
 *  - `company_domain` — son domaine.
 *
 * Puis le rattachement résolu (`resolveDealAccount`, crm-deal-account-link.ts) :
 * `account_id` et `account_link_basis` — la clé qui a joint, nommée, jamais
 * « par nom ». Le CHECK pose la liste fermée AVANT le code qui l'écrit (GA-11).
 *
 * NULLABLE partout : un deal déjà en cache n'a pas ces clés avant sa prochaine
 * synchronisation — absence, jamais un rattachement deviné. `ON DELETE SET
 * NULL` : un compte supprimé délie le deal, il ne supprime pas le fait CRM.
 */
export class CrmDealFactsAccountLink1796437900101 implements MigrationInterface {
  public name = 'CrmDealFactsAccountLink1796437900101'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE crm_deal_facts
        ADD COLUMN IF NOT EXISTS company_external_id text,
        ADD COLUMN IF NOT EXISTS company_siren text,
        ADD COLUMN IF NOT EXISTS company_domain text,
        ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS account_link_basis text
    `)
    await queryRunner.query(`
      ALTER TABLE crm_deal_facts
        DROP CONSTRAINT IF EXISTS crm_deal_facts_account_link_basis_check
    `)
    await queryRunner.query(`
      ALTER TABLE crm_deal_facts
        ADD CONSTRAINT crm_deal_facts_account_link_basis_check
        CHECK (account_link_basis IS NULL OR account_link_basis IN ('crm_company_id', 'siren', 'domain'))
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS crm_deal_facts_account_idx ON crm_deal_facts (account_id) WHERE account_id IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS crm_deal_facts_account_idx`)
    await queryRunner.query(`
      ALTER TABLE crm_deal_facts
        DROP CONSTRAINT IF EXISTS crm_deal_facts_account_link_basis_check,
        DROP COLUMN IF EXISTS account_link_basis,
        DROP COLUMN IF EXISTS account_id,
        DROP COLUMN IF EXISTS company_domain,
        DROP COLUMN IF EXISTS company_siren,
        DROP COLUMN IF EXISTS company_external_id
    `)
  }
}
