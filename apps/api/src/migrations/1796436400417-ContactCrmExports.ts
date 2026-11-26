import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3719.4 (06/10/2026) — « exporté vers mon CRM le … » retrouvable après
 * rechargement. Jusqu'ici l'état d'un export de contact vivait dans un
 * `useState` de la carte : au rechargement, la fiche ne savait plus si le
 * contact était déjà dans le CRM, et un second clic pouvait recréer l'objet.
 *
 * Une ligne par (contact, destination) : la ré-exportation MET À JOUR la ligne
 * (dernier geste, dernière date), elle n'en ajoute pas. Tranché sans Louis :
 * table dédiée plutôt qu'une colonne de `contacts` (un contact peut aller vers
 * plusieurs CRM) ou qu'une activité (un export n'est PAS un échange : il ne
 * doit ni toucher « Dernier échange » ni polluer la chronologie client).
 *
 * `provider` et `last_action` sont des listes fermées, posées ICI avant tout
 * code qui écrit (GA-11/GA-12). Effacement RGPD d'un contact : cascade.
 */
export class ContactCrmExports1796436400417 implements MigrationInterface {
  public name = 'ContactCrmExports1796436400417'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contact_crm_exports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        provider text NOT NULL,
        crm_record_id text NOT NULL,
        last_action text NOT NULL,
        destination_label text NULL,
        exported_by uuid NULL,
        exported_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT contact_crm_exports_provider_check CHECK (provider IN ('hubspot', 'salesforce', 'pipedrive', 'attio')),
        CONSTRAINT contact_crm_exports_action_check CHECK (last_action IN ('created', 'updated')),
        CONSTRAINT contact_crm_exports_unique UNIQUE (contact_id, provider)
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS contact_crm_exports_workspace_idx ON contact_crm_exports (workspace_id)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
