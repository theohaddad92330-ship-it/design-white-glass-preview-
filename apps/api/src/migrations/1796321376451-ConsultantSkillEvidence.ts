import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le modèle de preuve d'une compétence (#2793, épopée « Talent Skill Graph »,
 * #2328.4/.6/.11/.12/.13/.14/.24).
 *
 * Mesuré le 24/09/2026 (tri agent epopees-b) : `consultant_skills` ne porte
 * que `level` (déclaré) et `source` — ni famille, ni niveau VALIDÉ distinct du
 * déclaré, ni certification, ni retour client, ni marque « à vérifier » pour
 * une compétence lue seule dans un mot-clé. Ce chantier reste « système absent,
 * plusieurs jours » pour l'essentiel (structuration des expériences en dix
 * champs, mise à jour non destructive complète) ; cette migration pose la
 * PREMIÈRE tranche, provable seule : le modèle de preuve.
 *
 * `validated_level` REPREND le domaine de `level` (même contrainte, même
 * énumération SKILL_LEVELS) — GA-11/12 : la contrainte est élargie ICI, avant
 * tout code qui y écrirait une valeur.
 */
export class ConsultantSkillEvidence1796321376451 implements MigrationInterface {
  public name = 'ConsultantSkillEvidence1796321376451'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultant_skills
        ADD COLUMN IF NOT EXISTS family text,
        ADD COLUMN IF NOT EXISTS validated_level text,
        ADD COLUMN IF NOT EXISTS certification boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS client_feedback text,
        ADD COLUMN IF NOT EXISTS inferred boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS validated_by_consultant_at timestamptz,
        ADD COLUMN IF NOT EXISTS validated_by_recruiter_at timestamptz
    `)
    await queryRunner.query(`
      ALTER TABLE consultant_skills ADD CONSTRAINT consultant_skills_validated_level_check
        CHECK (validated_level IS NULL OR validated_level IN ('notions', 'autonome', 'confirme', 'expert', 'inconnu'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE consultant_skills DROP CONSTRAINT IF EXISTS consultant_skills_validated_level_check`,
    )
    await queryRunner.query(`
      ALTER TABLE consultant_skills
        DROP COLUMN IF EXISTS family,
        DROP COLUMN IF EXISTS validated_level,
        DROP COLUMN IF EXISTS certification,
        DROP COLUMN IF EXISTS client_feedback,
        DROP COLUMN IF EXISTS inferred,
        DROP COLUMN IF EXISTS validated_by_consultant_at,
        DROP COLUMN IF EXISTS validated_by_recruiter_at
    `)
  }
}
