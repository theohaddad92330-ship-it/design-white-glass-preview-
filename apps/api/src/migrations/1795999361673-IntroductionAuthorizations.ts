import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LA PREUVE D'AUTORISATION D'UNE INTRODUCTION, DANS LE TEMPS (#2373.9).
 *
 * LAU-FINAL-088 (§ PREUVES) : « conserver autorisation, date, canal, texte,
 * périmètre, restrictions ». Rien n'existait — un commercial pouvait citer
 * « de la part de X » sans que le produit sache jamais si X avait vraiment dit
 * oui, ni quand, ni pour quoi précisément.
 *
 * Ligne d'audit = jamais corrigée (même choix que `submission_feedback`,
 * `1790170000001` : aucun `updated_at`). `granted = false` se conserve aussi
 * — un refus est une preuve, pas moins qu'un accord : citer malgré un refus
 * enregistré doit rester détectable.
 */
export class IntroductionAuthorizations1795999361673 implements MigrationInterface {
  public name = 'IntroductionAuthorizations1795999361673'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS introduction_authorizations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        target_contact_id uuid NOT NULL,
        referrer_contact_id uuid,
        referrer_label text,
        granted boolean NOT NULL,
        channel text NOT NULL,
        text text,
        scope text,
        restrictions text,
        authorized_at timestamptz NOT NULL,
        recorded_by uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    // La lecture attendue par la recette : « l'historique d'autorisation de
    // CE contact cible », les plus récentes d'abord.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_introduction_authorizations_target
        ON introduction_authorizations (target_contact_id, workspace_id, authorized_at DESC)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
