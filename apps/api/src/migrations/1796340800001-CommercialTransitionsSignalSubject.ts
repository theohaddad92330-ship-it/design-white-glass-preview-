import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2320.14/.16 (épopée #2967) — élargit `commercial_transitions_subject_type_check`
 * (posée par `1796321347932`, élargie une première fois par `1796322820001`
 * pour `'opportunity'`) à une sixième valeur : `'signal'`.
 *
 * Le sixième sujet vit EN AMONT du besoin, sur une opportunité encore
 * informelle : Signal→Piste (#2320.14, `ProjectsService.applyConversion`) et
 * Opportunité→Besoin confirmé (#2320.16, `ProjectPipelineService.saveNeed`).
 * Aucune des deux transitions n'a de table à elle — GA-11/GA-12 : la
 * contrainte SQL s'élargit ICI, avant le code qui écrira la sixième valeur.
 */
export class CommercialTransitionsSignalSubject1796340800001 implements MigrationInterface {
  name = 'CommercialTransitionsSignalSubject1796340800001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE commercial_transitions
        DROP CONSTRAINT IF EXISTS commercial_transitions_subject_type_check,
        ADD CONSTRAINT commercial_transitions_subject_type_check
          CHECK (subject_type IN ('need', 'shortlist', 'submission', 'mission', 'opportunity', 'signal'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE commercial_transitions
        DROP CONSTRAINT IF EXISTS commercial_transitions_subject_type_check,
        ADD CONSTRAINT commercial_transitions_subject_type_check
          CHECK (subject_type IN ('need', 'shortlist', 'submission', 'mission', 'opportunity'))
    `)
  }
}
