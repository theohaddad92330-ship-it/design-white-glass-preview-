import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * L'archivage d'un talent (PDF 3 §10, boutons B13 et B14 ; §13.2).
 *
 * Le vivier ne connaissait que la suppression, et c'était un vrai `DELETE`.
 * Or le cas courant n'est pas « cette fiche est une erreur » mais « cette
 * personne est partie de l'ESN » — et là, le §13.2 est explicite : archivé,
 * missions conservées, retiré des matchings. Effacer perdrait l'historique de
 * missions d'un ancien salarié, qui est justement la preuve de compétence dont
 * l'ESN se sert pour vendre les suivants.
 *
 * `archived_at` plutôt qu'un booléen : savoir QUAND quelqu'un est sorti du
 * vivier actif répond à la moitié des questions qu'on se pose ensuite, et un
 * booléen ne le dira jamais.
 */
export class TalentArchive1789564918273 implements MigrationInterface {
  public name = 'TalentArchive1789564918273'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS archived_at timestamptz`)
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS archived_reason text`)
    // L'index porte sur les fiches ACTIVES : c'est la lecture de tous les jours,
    // et les archives se consultent rarement.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS consultants_active_idx
        ON consultants (workspace_id, updated_at DESC)
        WHERE archived_at IS NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS consultants_active_idx`)
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS archived_reason`)
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS archived_at`)
  }
}
