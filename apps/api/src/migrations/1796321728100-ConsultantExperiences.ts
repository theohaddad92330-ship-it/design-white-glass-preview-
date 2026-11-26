import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le modèle d'expérience structurée (#2793, épopée « Talent Skill Graph »,
 * #2328.9/.10/.22/.23) — la tranche restante après le modèle de preuve de
 * compétence (`1796321376451-ConsultantSkillEvidence`).
 *
 * `consultant_experiences` porte les DIX champs nommés du §4 CV (entreprise,
 * client final, secteur, rôle, dates, contexte, réalisations, technologies,
 * responsabilités, preuve) — plutôt que le bloc `experiences` plat de
 * `cv-parsing.ts` (`value: string | string[] | number | null`), qui ne peut
 * être cité précisément par une compétence prouvée.
 *
 * `client_masked_reason` NOT NULL dès que `client_masked` est vrai (GA-11/12,
 * contrainte élargie ICI, avant le code qui l'écrit) : un masquage sans
 * raison serait une invention de la même famille qu'un client inventé
 * (#2328.23).
 *
 * `consultant_skills.source_experience_id`/`source_project` lient une
 * compétence à l'expérience (#2328.9) et au projet nommé qui la prouvent
 * (#2328.10) — un projet ne peut exister sans son expérience.
 */
export class ConsultantExperiences1796321728100 implements MigrationInterface {
  public name = 'ConsultantExperiences1796321728100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS consultant_experiences (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        consultant_id uuid NOT NULL,
        workspace_id uuid,
        entreprise text,
        client_final text,
        client_masked boolean NOT NULL DEFAULT false,
        client_masked_reason text,
        secteur text,
        role text,
        date_debut date,
        date_fin date,
        contexte text,
        realisations text,
        technologies text[] NOT NULL DEFAULT '{}',
        responsabilites text,
        preuve text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT consultant_experiences_client_masked_reason_check
          CHECK (client_masked = false OR client_masked_reason IS NOT NULL)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS consultant_experiences_consultant_idx ON consultant_experiences (consultant_id)`,
    )
    // Purge de démonstration/espace : même patron que `consultant_skills`.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS consultant_experiences_workspace_idx ON consultant_experiences (workspace_id)`,
    )
    await queryRunner.query(`
      COMMENT ON TABLE consultant_experiences IS
        'Une experience structuree en dix champs nommes (#2328.22) - la base des preuves d''une competence (#2328.9/.10).'
    `)

    await queryRunner.query(`
      ALTER TABLE consultant_skills
        ADD COLUMN IF NOT EXISTS source_experience_id uuid REFERENCES consultant_experiences(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS source_project text
    `)
    await queryRunner.query(`
      ALTER TABLE consultant_skills ADD CONSTRAINT consultant_skills_source_project_needs_experience_check
        CHECK (source_project IS NULL OR source_experience_id IS NOT NULL)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE consultant_skills DROP CONSTRAINT IF EXISTS consultant_skills_source_project_needs_experience_check`,
    )
    await queryRunner.query(`
      ALTER TABLE consultant_skills
        DROP COLUMN IF EXISTS source_experience_id,
        DROP COLUMN IF EXISTS source_project
    `)
    await queryRunner.query(`DROP TABLE IF EXISTS consultant_experiences`)
  }
}
