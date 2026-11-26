import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `beta_feedback.user_id` devient NULLABLE — un signalement peut venir du
 * BACK-OFFICE, où il n'y a pas d'utilisateur Bellum.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * L'opérateur qui voit un défaut dans le back-office n'a aujourd'hui aucun
 * moyen de le remonter sans quitter l'écran : il doit rouvrir l'application
 * cliente, refaire le geste ailleurs, et le contexte est perdu. Le widget de
 * signalement arrive donc dans le back-office comme dans l'application.
 *
 * Un opérateur n'est PAS un utilisateur de l'espace : il s'authentifie en Basic
 * Auth devant le back-office, il n'a pas de `profiles.user_id`. Inventer un
 * identifiant d'utilisateur pour lui attribuerait un retour à quelqu'un qui ne
 * l'a pas écrit — sur une table qui sert d'historique, c'est une falsification.
 *
 * ⚠️ La contrainte SQL s'élargit AVANT le code qui écrit `null` (GA-11/GA-12).
 * Qui a écrit le retour reste dit : `client_context.source = 'backoffice'` et
 * `client_context.operator` portent le nom de l'opérateur.
 */
export class BetaFeedbackFromBackoffice1791610000000 implements MigrationInterface {
  public name = 'BetaFeedbackFromBackoffice1791610000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE beta_feedback ALTER COLUMN user_id DROP NOT NULL`)
  }

  /**
   * ⚠️ Le retour arrière SUPPRIME les retours d'opérateur.
   *
   * Il ne peut pas faire autrement : remettre `NOT NULL` sur une colonne qui
   * porte des `null` échoue, et leur inventer un utilisateur serait pire que de
   * les perdre. Le `down` est là pour être exécutable, pas pour être exécuté.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM beta_feedback WHERE user_id IS NULL`)
    await queryRunner.query(`ALTER TABLE beta_feedback ALTER COLUMN user_id SET NOT NULL`)
  }
}
