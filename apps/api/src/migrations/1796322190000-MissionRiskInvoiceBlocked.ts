import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2411.6 (reste, épopée #2881) — élargit la CHECK de `mission_risk_resolutions`
 * (`1796321507560-MissionRiskResolutions.ts`) à la dixième valeur de
 * `missionRiskSchema`, `invoice_blocked`.
 *
 * GA-11 / GA-12 : la contrainte SQL s'élargit ICI, AVANT le code qui écrit
 * cette valeur (`missionRisks()`, `packages/contracts/src/schemas/mission.ts`)
 * — un `PATCH /delivery/missions/:id/risks/invoice_blocked` qui partirait
 * avant cette migration serait rejeté par PostgreSQL, jamais par une simple
 * relecture.
 *
 * ⚠️ Un CHECK ne s'ALTER pas en place : DROP puis ADD, sous le MÊME nom de
 * contrainte (`mission_risk_resolutions_risk_check`) — même mécanique que
 * `1795200000003-MissionRenewalOpportunity.ts` pour une FK. `down` restaure
 * l'ancienne liste à neuf valeurs — un risque déjà résolu comme
 * `invoice_blocked` romprait alors la contrainte restaurée, ce qui est le
 * signal correct : `invoice_blocked` n'existe plus, la ligne qui le cite ne
 * devrait pas non plus.
 */
export class MissionRiskInvoiceBlocked1796322190000 implements MigrationInterface {
  name = 'MissionRiskInvoiceBlocked1796322190000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_risk_resolutions
        DROP CONSTRAINT IF EXISTS mission_risk_resolutions_risk_check
    `)
    await queryRunner.query(`
      ALTER TABLE mission_risk_resolutions
        ADD CONSTRAINT mission_risk_resolutions_risk_check CHECK (
          risk IN (
            'renewal_not_started',
            'timesheet_disputed',
            'timesheet_missing',
            'margin_at_risk',
            'margin_unknown',
            'no_end_date',
            'missing_po',
            'ending_soon',
            'missing_owner',
            'invoice_blocked'
          )
        )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_risk_resolutions
        DROP CONSTRAINT IF EXISTS mission_risk_resolutions_risk_check
    `)
    await queryRunner.query(`
      ALTER TABLE mission_risk_resolutions
        ADD CONSTRAINT mission_risk_resolutions_risk_check CHECK (
          risk IN (
            'renewal_not_started',
            'timesheet_disputed',
            'timesheet_missing',
            'margin_at_risk',
            'margin_unknown',
            'no_end_date',
            'missing_po',
            'ending_soon',
            'missing_owner'
          )
        )
    `)
  }
}
