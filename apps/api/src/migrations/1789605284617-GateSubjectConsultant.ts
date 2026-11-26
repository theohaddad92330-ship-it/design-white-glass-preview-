import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La porte G4 décide d'une PERSONNE, pas d'un besoin.
 *
 * La contrainte est élargie AVANT le code qui écrit la valeur — règle du dépôt
 * depuis le CHECK d'`account_vocabulary.kind` : toute valeur qui voyage du code
 * vers la base voit sa contrainte élargie d'abord, sinon le premier
 * positionnement en production tombe sur une violation que rien n'annonce.
 *
 * Ranger un franchissement de G4 sous le BESOIN aurait été plus simple et aurait
 * rendu indiscernables les cinq profils qu'on y examine — or c'est exactement ce
 * qu'on voudra relire six mois plus tard.
 */
export class GateSubjectConsultant1789605284617 implements MigrationInterface {
  public name = 'GateSubjectConsultant1789605284617'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE decision_gate_crossings DROP CONSTRAINT IF EXISTS decision_gate_crossings_subject_check`,
    )
    await queryRunner.query(`
      ALTER TABLE decision_gate_crossings ADD CONSTRAINT decision_gate_crossings_subject_check
        CHECK (subject IN ('account', 'contact', 'project', 'need', 'submission', 'mission', 'playbook', 'consultant'))
    `)
  }

  public async down(): Promise<void> {
    // Forward-only : reposer l'ancienne contrainte rendrait illisibles les
    // franchissements de G4 déjà écrits.
  }
}
