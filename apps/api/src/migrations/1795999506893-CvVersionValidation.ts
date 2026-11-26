import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Statut, validation et diff d'une version de dossier de compétences
 * (#2333.2/.5/.8/.9/.11 — LAU-FINAL-074 CV TARGETING, VERSIONING ET FACTUAL
 * INTEGRITY).
 *
 * Trois ajouts, un par manque mesuré :
 *
 *  - `changes` porte le diff RETENU + BARRÉ de chaque compétence déclarée
 *    (avant/après/raison/preuve source) — `excluded_skills` ne portait que la
 *    moitié « barrée » du diff.
 *  - `status` + `validated_by`/`validated_at` portent le geste humain de
 *    validation, quand la policy d'espace l'exige.
 *  - `cv_validation_policy` sur `workspaces` (même patron que
 *    `anonymisation_rule`, migration `1789571845632`) : QUI doit valider —
 *    personne (la génération vaut validation), le consultant, ou un
 *    recruteur.
 *
 * Défaut `status = 'validated'` : les versions déjà en base n'ont jamais
 * demandé de validation, les basculer en attente romprait leur usage actuel
 * (téléchargement Word/PDF, déjà livré) sans qu'aucun geste ne les débloque.
 */
export class CvVersionValidation1795999506893 implements MigrationInterface {
  public name = 'CvVersionValidation1795999506893'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE cv_versions ADD COLUMN IF NOT EXISTS changes jsonb NOT NULL DEFAULT '[]'`)
    await queryRunner.query(`ALTER TABLE cv_versions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'validated'`)
    await queryRunner.query(`ALTER TABLE cv_versions DROP CONSTRAINT IF EXISTS cv_versions_status_check`)
    await queryRunner.query(`
      ALTER TABLE cv_versions ADD CONSTRAINT cv_versions_status_check
        CHECK (status IN ('draft', 'pending_validation', 'validated'))
    `)
    await queryRunner.query(`ALTER TABLE cv_versions ADD COLUMN IF NOT EXISTS validated_by uuid`)
    await queryRunner.query(`ALTER TABLE cv_versions ADD COLUMN IF NOT EXISTS validated_at timestamptz`)

    await queryRunner.query(
      `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS cv_validation_policy text NOT NULL DEFAULT 'aucune'`,
    )
    await queryRunner.query(`ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_cv_validation_policy_check`)
    await queryRunner.query(`
      ALTER TABLE workspaces ADD CONSTRAINT workspaces_cv_validation_policy_check
        CHECK (cv_validation_policy IN ('aucune', 'consultant', 'recruteur'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_cv_validation_policy_check`)
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS cv_validation_policy`)
    await queryRunner.query(`ALTER TABLE cv_versions DROP COLUMN IF EXISTS validated_at`)
    await queryRunner.query(`ALTER TABLE cv_versions DROP COLUMN IF EXISTS validated_by`)
    await queryRunner.query(`ALTER TABLE cv_versions DROP CONSTRAINT IF EXISTS cv_versions_status_check`)
    await queryRunner.query(`ALTER TABLE cv_versions DROP COLUMN IF EXISTS status`)
    await queryRunner.query(`ALTER TABLE cv_versions DROP COLUMN IF EXISTS changes`)
  }
}
