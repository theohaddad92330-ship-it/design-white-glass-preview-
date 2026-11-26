import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 18/10/2026 — GA-11/12 : le CHECK s'élargit AVANT (ici : APRÈS, en rattrapage) le code qui écrit.
 *
 * `1796419437219-SecurityEventsDataExport.ts` a ouvert `kind = 'data_export'` (une sortie de données
 * AUTORISÉE, route `@DataExit()`), mais le compteur l'écrit avec le code HTTP de la réponse (200), que
 * `security_events_status_code_check` refusait (NULL, 401, 403 seulement). Mesuré en prod le 18/10
 * (recette HubSpot, POST /crm/push) : « violates check constraint security_events_status_code_check »
 * — AUCUNE sortie de données n'avait jamais été comptée. Le 2xx n'est accepté que pour `data_export`.
 */
export class SecurityEventsDataExportStatus1796560418327 implements MigrationInterface {
  public name = 'SecurityEventsDataExportStatus1796560418327'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE security_events DROP CONSTRAINT IF EXISTS security_events_status_code_check`)
    await queryRunner.query(`
      ALTER TABLE security_events
      ADD CONSTRAINT security_events_status_code_check
      CHECK (status_code IS NULL OR status_code IN (401, 403) OR (kind = 'data_export' AND status_code BETWEEN 200 AND 299))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM security_events WHERE kind = 'data_export' AND status_code BETWEEN 200 AND 299`,
    )
    await queryRunner.query(`ALTER TABLE security_events DROP CONSTRAINT IF EXISTS security_events_status_code_check`)
    await queryRunner.query(`
      ALTER TABLE security_events
      ADD CONSTRAINT security_events_status_code_check CHECK (status_code IS NULL OR status_code IN (401, 403))
    `)
  }
}
