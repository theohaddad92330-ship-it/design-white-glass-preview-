import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4188 (14/10/2026) — « ce compte, je l'envoie sur mon CRM ».
 *
 * Deux gestes, posés ICI avant tout code qui écrit (GA-11/GA-12) :
 *
 * 1. `account_crm_exports` — le pendant, pour un COMPTE, de
 *    `contact_crm_exports` (#3719.4) : une ligne par (compte, destination),
 *    qui porte l'identifiant de la société dans le CRM. C'est la RÉFÉRENCE
 *    EXTERNE sur laquelle un second envoi s'appuie : il ne recrée pas la
 *    société, il la retrouve. Table dédiée pour la même raison que les
 *    contacts — un compte peut aller vers plusieurs CRM, et un envoi n'est pas
 *    un échange (il ne touche ni « Dernier échange » ni la chronologie).
 *    Effacement du compte : cascade.
 *
 * 2. `contact_crm_exports_provider_check` ÉLARGIE à `odoo` : depuis #4186, un
 *    contact part vers Odoo par la porte commune, et son envoi se consigne
 *    comme les autres. Aucune valeur retirée (GA-08).
 */
export class AccountCrmExports1796541495729 implements MigrationInterface {
  public name = 'AccountCrmExports1796541495729'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE contact_crm_exports DROP CONSTRAINT IF EXISTS contact_crm_exports_provider_check`,
    )
    await queryRunner.query(`
      ALTER TABLE contact_crm_exports ADD CONSTRAINT contact_crm_exports_provider_check
        CHECK (provider IN ('hubspot', 'salesforce', 'pipedrive', 'attio', 'odoo'))
    `)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS account_crm_exports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        provider text NOT NULL,
        crm_record_id text NOT NULL,
        last_action text NOT NULL,
        destination_label text NULL,
        exported_by uuid NULL,
        exported_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT account_crm_exports_provider_check
          CHECK (provider IN ('hubspot', 'salesforce', 'pipedrive', 'attio', 'odoo')),
        CONSTRAINT account_crm_exports_action_check CHECK (last_action IN ('created', 'updated')),
        CONSTRAINT account_crm_exports_unique UNIQUE (account_id, provider)
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS account_crm_exports_workspace_idx ON account_crm_exports (workspace_id)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
