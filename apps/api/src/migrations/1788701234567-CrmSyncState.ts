import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * L'état de synchronisation CRM d'un contact.
 *
 * Deux colonnes seulement, et chacune répond à une question que le produit ne
 * savait pas répondre.
 *
 * `crm_record_id` — la fiche existe-t-elle côté CRM, et laquelle ? Sans elle, on
 * relançait une recherche par e-mail à chaque passage, ce qui coûte un appel
 * réseau pour redécouvrir ce qu'on savait déjà. Et surtout : « déjà connu » ne
 * pouvait pas distinguer un contact ajouté par un collègue d'un contact jamais
 * touché.
 *
 * `crm_synced_at` — quand l'a-t-on rapproché pour la dernière fois ? C'est ce
 * qui fait tourner la borne de volume : les plus anciens passent d'abord, donc
 * l'ensemble se parcourt sur plusieurs passages au lieu de re-balayer
 * indéfiniment les mêmes premiers contacts.
 *
 * Toutes deux nullables, sans valeur par défaut : `NULL` veut dire « jamais
 * rapproché », qui est différent de « rapproché sans résultat ». Un défaut à
 * `now()` ferait croire que tout l'existant a été vérifié.
 */
export class CrmSyncState1788701234567 implements MigrationInterface {
  name = 'CrmSyncState1788701234567'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS crm_record_id text`)
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS crm_synced_at timestamptz`)
    await queryRunner.query(`
      COMMENT ON COLUMN contacts.crm_record_id IS
        'Identifiant de la fiche côté CRM quand elle existe. NULL = pas de fiche connue, ou jamais cherchée.'
    `)
    await queryRunner.query(`
      COMMENT ON COLUMN contacts.crm_synced_at IS
        'Dernier rapprochement avec le CRM. NULL = jamais rapproché (distinct de « rapproché sans résultat »). Ordonne la file de synchronisation : les plus anciens d''abord.'
    `)
    // Index sur la file de synchronisation : la boucle lit « les plus anciens
    // de cet espace », et sans index elle ferait un tri complet de la table à
    // chaque passage.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS contacts_crm_sync_queue_idx ON contacts (workspace_id, crm_synced_at NULLS FIRST)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS contacts_crm_sync_queue_idx`)
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS crm_synced_at`)
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS crm_record_id`)
  }
}
