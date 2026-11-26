import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2377.1/.4/.6 — le DEBRIEF de fin d'appel.
 *
 * Colonne unique JSONB plutôt que quatre colonnes scalaires : `fact`, `need`,
 * `objection`, `engagement` et l'éventuelle prochaine action forment UN seul
 * objet optionnel (`callDebriefSchema` mergé avec `nextAction`,
 * `packages/contracts/src/schemas/activity.ts`) — jamais interrogé par un
 * `WHERE` structurel aujourd'hui, une colonne JSON évite quatre migrations
 * pour un objet qui n'existe qu'en lecture/écriture complète. `NULL` par
 * défaut : une ligne sans debrief — nouvelle comme ancienne — se lit
 * « non saisi », jamais un objet vide inventé.
 */
export class ActivityCallDebrief1795999518102 implements MigrationInterface {
  public name = 'ActivityCallDebrief1795999518102'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS call_debrief jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE activities DROP COLUMN IF EXISTS call_debrief`)
  }
}
