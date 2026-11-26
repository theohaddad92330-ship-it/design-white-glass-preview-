import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2320.7/.23 (épopée #2967) — élargit `commercial_transitions_subject_type_check`
 * (migration `1796321347932`) à une cinquième valeur : `'opportunity'`.
 *
 * La chaîne commerciale a déjà un objet canonique — compte, périmètre, porteur,
 * étape, valeur — mais il vit sous le nom `opportunities` (`ProjectEntity`,
 * `ProjectsService`), jamais sous le nom que #2320.7 cherchait
 * (« objet canonique OPPORTUNITY »). Il portait déjà un mouvement d'étape
 * (`stageTransitionEffects`) ET une trace best-effort dans la timeline
 * (`traceStageChange`), mais AUCUNE ligne dans le journal APPEND-ONLY que
 * #2320.23 a posé pour le reste de la chaîne (need/shortlist/submission/mission)
 * — la chaîne commerciale avait un trou exactement sur son propre pivot.
 *
 * GA-11/GA-12 : la contrainte SQL s'élargit ICI, avant le code qui écrira la
 * cinquième valeur (`ProjectsService.updateStage`).
 */
export class CommercialTransitionsOpportunitySubject1796322820001 implements MigrationInterface {
  name = 'CommercialTransitionsOpportunitySubject1796322820001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE commercial_transitions
        DROP CONSTRAINT IF EXISTS commercial_transitions_subject_type_check,
        ADD CONSTRAINT commercial_transitions_subject_type_check
          CHECK (subject_type IN ('need', 'shortlist', 'submission', 'mission', 'opportunity'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE commercial_transitions
        DROP CONSTRAINT IF EXISTS commercial_transitions_subject_type_check,
        ADD CONSTRAINT commercial_transitions_subject_type_check
          CHECK (subject_type IN ('need', 'shortlist', 'submission', 'mission'))
    `)
  }
}
