import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2193.17 / #2193.18 (épopée #2953) — L'OBJECTIF ET LE PÉRIMÈTRE D'UNE MISSION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'onglet Synthèse du dossier mission (#2193) demande deux champs qu'aucune
 * source ne porte au handoff, contrairement à `location`/`remote_preference`
 * (repris de `project_needs`, #2191.17/.18) : ni le besoin ni le projet ne
 * portent d'« objectif » ou de « périmètre » — vérifié sur `project_needs`,
 * `project.entity.ts`. Ce sont deux champs SAISIS sur la fiche, pas repris.
 *
 * GA-11/GA-12 — cette migration ARRIVE AVANT `DeliveryService.updateMission`
 * (même commit, mais dans l'ordre : la table s'élargit, le code écrit ensuite).
 *
 * Additif, aucune ligne existante n'est touchée : toute mission déjà en base
 * naît avec les deux colonnes à `null` — « non renseigné », jamais deviné.
 */
export class MissionObjectiveAndPerimeter1796322788672 implements MigrationInterface {
  name = 'MissionObjectiveAndPerimeter1796322788672'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE missions
        ADD COLUMN IF NOT EXISTS objective text,
        ADD COLUMN IF NOT EXISTS perimeter text
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE missions
        DROP COLUMN IF EXISTS objective,
        DROP COLUMN IF EXISTS perimeter
    `)
  }
}
