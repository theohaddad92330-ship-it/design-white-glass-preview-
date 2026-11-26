import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LE DUAL TRACK — #2413.49 à .57 (épopée #2965, LAU-FINAL-127).
 *
 * `missions.renewal_status` (migration `1795100000001`) porte UN statut par
 * mission ; le renouvellement dépend de DEUX volontés séparées, client et
 * consultant, qui n'avancent pas ensemble. `git grep -in
 * "clientIntent|consultantIntent"` = 0 résultat au 17/09/2026 (registre
 * `.claude/notes/registre-2026-09-17-lau-127-2413.md`) : rien ne les
 * distinguait.
 *
 * `jsonb`, SANS contrainte `CHECK` — même patron que `outbound_write_requests
 * .source` (migration `1796001551585`) : la forme (`{ intent, scope, budget,
 * process, updatedAt, updatedBy }` côté client ; `{ intent, conditions,
 * availability, otherOptions, updatedAt, updatedBy }` côté consultant) est
 * portée par `renewalClientRailSchema` / `renewalConsultantRailSchema`
 * (`packages/contracts/src/schemas/mission-renewal-rail.ts`), pas par SQL.
 * GA-11/GA-12 (contrainte à élargir AVANT le code) ne s'applique qu'aux
 * colonnes à énumération SCALAIRE ; un blob validé à la frontière n'en est
 * pas une.
 *
 * ADDITIVE et NULLABLE : les missions déjà en base n'ont ni l'un ni l'autre
 * rail ouvert. `NULL` s'y lit comme `non_demande` des deux côtés
 * (`canConfirmRenewal`) — jamais un défaut qui affirmerait un rail répondu
 * que personne n'a rempli.
 */
export class MissionRenewalRails1796321339583 implements MigrationInterface {
  public name = 'MissionRenewalRails1796321339583'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS renewal_client_rail jsonb`)
    await queryRunner.query(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS renewal_consultant_rail jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE missions DROP COLUMN IF EXISTS renewal_consultant_rail`)
    await queryRunner.query(`ALTER TABLE missions DROP COLUMN IF EXISTS renewal_client_rail`)
  }
}
