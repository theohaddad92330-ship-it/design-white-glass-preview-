import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Un quatrième moment où l'on pose la question d'accès : la qualification du
 * Sprint 3 (`T5.md:882-899`).
 *
 * ⚠️ **La contrainte s'élargit AVANT le code qui l'écrit** (GA-11 / GA-12). Sans
 * cette migration en premier, la première réponse d'un utilisateur ferait
 * exploser un `INSERT` sur `access_fact_questions_moment_check` — un 500 en
 * production sur un geste que l'écran vient de proposer.
 *
 * La liste est réécrite en entier, avec les trois valeurs existantes reprises
 * telles quelles : un enum ne perd jamais de valeur (GA-08), et la nouvelle va
 * en FIN. La contrainte d'origine (`1789994210583-CommunityAccessFacts`) était
 * posée en ligne dans le `CREATE TABLE` — on la retire nommément avant de la
 * reposer, ce que `IF EXISTS` rend sûr sur une base où elle aurait déjà bougé.
 *
 * Pourquoi `volume` et pas un quatrième niveau de sprint : le board du tome 5 a
 * trois colonnes et une sortie (`focus` · `extension` · `volume` · `no_go`).
 * Le « Sprint 3 » de la source EST la troisième colonne, celle de la
 * qualification au volume — aucune valeur de `SPRINT_LEVELS` n'est ajoutée.
 */
export class AccessQuestionSprint3Moment1791550000001 implements MigrationInterface {
  name = 'AccessQuestionSprint3Moment1791550000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE access_fact_questions
        DROP CONSTRAINT IF EXISTS access_fact_questions_moment_check
    `)
    await queryRunner.query(`
      ALTER TABLE access_fact_questions
        ADD CONSTRAINT access_fact_questions_moment_check
        CHECK (moment IN ('after_refusal', 'mission_end', 'first_contact', 'sprint3_qualification'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Le retour arrière ne peut pas restreindre en aveugle : des lignes portant
    // le moment neuf peuvent exister, et `ADD CONSTRAINT` échouerait sur elles.
    // On archive plutôt que de supprimer — les traces restent, la contrainte
    // redevient celle d'avant seulement si elles sont déjà parties.
    await queryRunner.query(`
      ALTER TABLE access_fact_questions
        DROP CONSTRAINT IF EXISTS access_fact_questions_moment_check
    `)
    await queryRunner.query(`
      DELETE FROM access_fact_questions WHERE moment = 'sprint3_qualification'
    `)
    await queryRunner.query(`
      ALTER TABLE access_fact_questions
        ADD CONSTRAINT access_fact_questions_moment_check
        CHECK (moment IN ('after_refusal', 'mission_end', 'first_contact'))
    `)
  }
}
