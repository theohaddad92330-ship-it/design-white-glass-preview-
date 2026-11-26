import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3918 (lot Y12, 08/10/2026) — `crm_deal_facts.last_activity_at`, ADDITIVE.
 *
 * Sans elle, « affaire dormante » n'aurait que la date de CRÉATION du deal à
 * se mettre sous la dent — un deal créé il y a six mois et modifié hier
 * compterait comme dormant depuis six mois. `hs_lastmodifieddate` (HubSpot)
 * est maintenant lu (`hubspot-depth.client.ts`, `DEAL_PROPERTIES`) et mis en
 * cache ici ; `CrmDealSignalsSweeper` retombe sur `deal_created_at` quand elle
 * est `null` (deal jamais modifié, ou fournisseur qui ne l'expose pas) —
 * nommé par l'appelant, jamais deviné.
 *
 * NULLABLE : les lignes déjà en cache n'ont pas cette donnée avant leur
 * prochaine synchronisation — absence, pas un zéro qui mentirait sur la date.
 */
export class CrmDealFactsLastActivity1796437800006 implements MigrationInterface {
  public name = 'CrmDealFactsLastActivity1796437800006'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE crm_deal_facts
        ADD COLUMN IF NOT EXISTS last_activity_at timestamptz
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE crm_deal_facts DROP COLUMN IF EXISTS last_activity_at`)
  }
}
