import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Attribution d'un contact — `contacts.assigned_to`.
 *
 * Transposition EXACTE de `accounts.assigned_to` (migration 1786958241077) au
 * contact : le portefeuille se pilote au compte, mais la sélection de contacts
 * de l'écran Contacts se répartit elle aussi entre commerciaux (« celui-là est
 * pour toi »). Jusqu'ici la seule notion d'appartenance d'un contact était
 * `contacts.user_id`, qui est une attribution de CRÉATION, pas d'allocation.
 *
 * Volontairement NON backfillée depuis `user_id` : présumer « créateur =
 * porteur » déclarerait une répartition fictive dès le premier jour et
 * masquerait exactement le signal que l'écran doit montrer. `NULL` = « non
 * attribué », l'état honnête de départ.
 *
 * Nullable par construction : retirer l'attribution (`assigned_to = NULL`) est
 * un geste produit supporté, pas un défaut de donnée.
 *
 * Idempotente (`IF NOT EXISTS` sur la colonne comme sur l'index) : rejouable
 * sans effet de bord.
 */
export class ContactAssignment1788236104913 implements MigrationInterface {
  public name = 'ContactAssignment1788236104913'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS assigned_to uuid`)
    // Sert les deux lectures : « les contacts de ce membre » et la file des non
    // attribués (`assigned_to IS NULL`) — toutes deux scopées workspace d'abord.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS contacts_workspace_assigned_idx ON contacts (workspace_id, assigned_to)`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
