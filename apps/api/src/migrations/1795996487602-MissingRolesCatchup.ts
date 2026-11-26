import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2637.1 (21/09/2026) — LE RATTRAPAGE AUTOMATIQUE DES RÔLES MANQUANTS.
 *
 * Même forme que `1795716734279-AddressabilityRelationCollectedAt` : additive,
 * `IF NOT EXISTS`, aucune migration `down` (convention du dépôt).
 *
 * Deux colonnes, jamais une seule — voir le docblock de
 * `packages/contracts/src/schemas/missing-roles-catchup.ts` pour le détail :
 *  - `missing_roles_catchup_at` (`timestamptz`, NULLABLE) : quand ce compte a
 *    été rattrapé pour la DERNIÈRE fois par `MissingRolesCatchupService`.
 *    `NULL` = jamais rattrapé — CONCERNÉ, jamais présumé à jour.
 *  - `missing_roles_catchup_attempts` (`integer`, `NOT NULL DEFAULT 0`) : le
 *    nombre de passages automatiques déjà reçus. Un compteur, pas une date :
 *    c'est lui qui borne les REPRISES d'un job qui reste `partial`/`failed`,
 *    indépendamment de la date de la capacité.
 *
 * Seul écrivain prévu : `MissingRolesCatchupService.markAttempt`. Le bouton
 * manuel (« Enrichir les rôles manquants ») ne lit ni n'écrit ces colonnes —
 * voir le docblock du contrat.
 */
export class MissingRolesCatchup1795996487602 implements MigrationInterface {
  public name = 'MissingRolesCatchup1795996487602'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS missing_roles_catchup_at timestamptz NULL`)
    await queryRunner.query(
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS missing_roles_catchup_attempts integer NOT NULL DEFAULT 0`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
