import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2914 (#2128.9) — mentionner un collègue dans un commentaire d'équipe.
 *
 * `team_comments` (`1788230518044-TeamComments`) n'avait aucun moyen de
 * DÉSIGNER un membre précis dans un commentaire — seul le fil général ou le
 * compte visé pouvaient être ciblés. Additive et jamais NULL : un tableau
 * vide dit « personne mentionné », ce qui est vrai pour tout commentaire
 * déjà écrit — pas une absence à nommer.
 */
export class TeamCommentsMentions1796321387113 implements MigrationInterface {
  public name = 'TeamCommentsMentions1796321387113'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE team_comments ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[] NOT NULL DEFAULT '{}';
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
