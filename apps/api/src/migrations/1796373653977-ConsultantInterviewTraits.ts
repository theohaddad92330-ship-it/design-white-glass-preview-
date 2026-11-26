import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * BEL-SC-238 (#3267) — les traits observés en ENTRETIEN (communication,
 * autonomie) et le temps avant efficacité annoncé.
 *
 * ADDITIVE, NULLABLE, sans CHECK — même patron que `ConsultantConsentRestrictions` :
 * une fiche jamais entretenue lit NULL, jamais un tableau vide qui se lirait
 * « entretenu, rien à signaler ». `interview_traits` est un JSONB (liste courte
 * de deux entrées au plus, chacune typée par `talentInterviewTraitSchema`),
 * même famille que la colonne `languages` déjà en place. Le temps avant
 * efficacité est un FAIT UNIQUE, pas une liste — quatre colonnes plates, même
 * patron que `tjm_validated_at`/`cv_validated_at`.
 */
export class ConsultantInterviewTraits1796373653977 implements MigrationInterface {
  name = 'ConsultantInterviewTraits1796373653977'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultants
        ADD COLUMN IF NOT EXISTS interview_traits jsonb,
        ADD COLUMN IF NOT EXISTS ramp_up_band text,
        ADD COLUMN IF NOT EXISTS ramp_up_note text,
        ADD COLUMN IF NOT EXISTS ramp_up_recorded_at timestamptz,
        ADD COLUMN IF NOT EXISTS ramp_up_recorded_by_name text;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultants
        DROP COLUMN IF EXISTS interview_traits,
        DROP COLUMN IF EXISTS ramp_up_band,
        DROP COLUMN IF EXISTS ramp_up_note,
        DROP COLUMN IF EXISTS ramp_up_recorded_at,
        DROP COLUMN IF EXISTS ramp_up_recorded_by_name;
    `)
  }
}
