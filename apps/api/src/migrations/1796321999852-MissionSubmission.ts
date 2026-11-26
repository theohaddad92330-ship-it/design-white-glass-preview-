import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2339.7 (épopée #2795) — le POSITIONNEMENT retenu (`submissions.id`) dont
 * une mission est la CONVERSION. `DeliveryService.create()` écrivait déjà
 * `opportunity_id`/`need_id`/`crm_deal_id` (l'affaire, le rôle, le deal CRM
 * repris) mais aucune colonne ne rattachait le TALENT réellement positionné —
 * `assertMissionStartGate` ne pouvait donc jamais vérifier le handoff avant
 * une conversion, faute de savoir QUEL positionnement elle referme.
 *
 * Colonne NULLABLE, additive, même forme que `crm_deal_id` (migration
 * `1795660000000`) : une RÉFÉRENCE, jamais devinée. `NULL` = pas de
 * positionnement connu — le cas d'une mission créée sans être passée par un
 * appel d'offres suivi (saisie manuelle, reprise CRM).
 *
 * ⚠️ Horodatage relevé le 27/09/2026 (intégration matin, GA-372) : la branche
 * chantier A portait `1796321996935`, sous le maximum déjà en service sur
 * origin/main (`1796321999830`) au moment de la fusion — repris strictement
 * au-dessus.
 */
export class MissionSubmission1796321999852 implements MigrationInterface {
  name = 'MissionSubmission1796321999852'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE missions
        ADD COLUMN IF NOT EXISTS submission_id uuid NULL REFERENCES submissions(id)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS missions_submission_idx ON missions (submission_id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS missions_submission_idx
    `)
    await queryRunner.query(`
      ALTER TABLE missions
        DROP COLUMN IF EXISTS submission_id
    `)
  }
}
