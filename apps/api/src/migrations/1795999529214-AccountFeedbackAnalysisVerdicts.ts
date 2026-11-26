import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2076.9-.12 — élargit le vocabulaire des VERDICTS de `account_feedback`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE : LA CONTRAINTE D'ABORD, LE CODE ENSUITE (GA-11/GA-12)
 * ─────────────────────────────────────────────────────────────────────────────
 * « Première preuve sur une situation connue » (#2076) : sur un compte que
 * l'utilisateur connaît déjà, il juge la PREMIÈRE analyse — juste, partielle,
 * fausse, ou incomplète. C'est un axe de JUSTESSE, différent de l'axe
 * d'utilité (`utile`/`inutile`) déjà porté par le même vocabulaire — même
 * table, même colonne (GA-26), les quatre nouvelles valeurs sont ajoutées EN
 * FIN de la liste (GA-08 : jamais réordonnée). `faux` coïncide déjà et n'est
 * pas dupliqué.
 *
 * `1785880000000-AccountFeedback` posait la contrainte d'origine
 * (`utile`, `inutile`, `faux`, `obsolete`) : celle-ci la reprend en entier et
 * ajoute `juste`, `partiel`, `manquant`.
 */
export class AccountFeedbackAnalysisVerdicts1795999529214 implements MigrationInterface {
  public name = 'AccountFeedbackAnalysisVerdicts1795999529214'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE account_feedback DROP CONSTRAINT IF EXISTS account_feedback_verdict_check`)
    await queryRunner.query(`
      ALTER TABLE account_feedback ADD CONSTRAINT account_feedback_verdict_check
        CHECK (verdict IN ('utile', 'inutile', 'faux', 'obsolete', 'juste', 'partiel', 'manquant'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Les trois verdicts neufs n'ont pas d'équivalent honnête dans l'ancien
    // vocabulaire (deviner « juste » → « utile » falsifierait l'axe jugé) —
    // la suppression est le seul retour arrière qui ne réécrit pas un fait.
    await queryRunner.query(`DELETE FROM account_feedback WHERE verdict IN ('juste', 'partiel', 'manquant')`)
    await queryRunner.query(`ALTER TABLE account_feedback DROP CONSTRAINT IF EXISTS account_feedback_verdict_check`)
    await queryRunner.query(`
      ALTER TABLE account_feedback ADD CONSTRAINT account_feedback_verdict_check
        CHECK (verdict IN ('utile', 'inutile', 'faux', 'obsolete'))
    `)
  }
}
