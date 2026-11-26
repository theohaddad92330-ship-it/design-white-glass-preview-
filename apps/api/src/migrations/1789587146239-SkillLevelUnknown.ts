import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Un cinquième niveau de compétence : « inconnu ».
 *
 * La contrainte est élargie AVANT le code qui écrit la valeur — c'est la règle
 * du dépôt depuis le CHECK de account_vocabulary.kind : toute valeur qui voyage
 * du code vers la base voit sa contrainte élargie d'abord, sinon le premier
 * enregistrement en production tombe sur une violation que rien n'annonce.
 *
 * Pourquoi ce niveau existe : les compétences saisies dans le champ libre d'une
 * fiche, comme celles lues sur un CV, arrivent sans niveau. Les enregistrer
 * « autonome » (le défaut de la table) afficherait devant un client une
 * évaluation que personne n'a faite.
 */
export class SkillLevelUnknown1789587146239 implements MigrationInterface {
  public name = 'SkillLevelUnknown1789587146239'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultant_skills DROP CONSTRAINT IF EXISTS consultant_skills_level_check`)
    await queryRunner.query(`
      ALTER TABLE consultant_skills ADD CONSTRAINT consultant_skills_level_check
        CHECK (level IN ('notions', 'autonome', 'confirme', 'expert', 'inconnu'))
    `)
  }

  public async down(): Promise<void> {
    // Forward-only : reposer l'ancienne contrainte rendrait illisibles les
    // lignes déjà écrites au niveau « inconnu ».
  }
}
