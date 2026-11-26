import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3440 (recette prod 03/10) — « M1 — Décideur — note d'invitation » : l'étape affichée était fausse,
 * la note d'invitation PRÉCÈDE l'acceptation, elle n'est pas M1. Le jeu livré dit désormais
 * « Invitation — … » ; les lignes DÉJÀ importées sont retitrées sur place (l'import dédoublonne sur
 * le titre : sans cela, un nouvel import poserait une seconde note à côté de l'ancienne).
 * Seules les lignes d'étape `invitation` au titre d'origine sont touchées — un titre modifié à la
 * main n'est pas réécrit. Aucune colonne, aucune contrainte : les données seulement.
 */
export class MessageLibraryInvitationTitle1796426851327 implements MigrationInterface {
  name = 'MessageLibraryInvitationTitle1796426851327'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE message_library_entries
         SET title = regexp_replace(title, '^M1 — ', 'Invitation — ')
       WHERE step = 'invitation' AND title ~ '^M1 — .* — note d’invitation'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE message_library_entries
         SET title = regexp_replace(title, '^Invitation — ', 'M1 — ')
       WHERE step = 'invitation' AND title ~ '^Invitation — .* — note d’invitation'
    `)
  }
}
