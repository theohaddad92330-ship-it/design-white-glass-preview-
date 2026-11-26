import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Newsletter Changelog — le substrat des deux garanties promises à l'écran
 * Réglages › Notifications (« Recevez un e-mail bimensuel récapitulant les
 * nouveautés et améliorations »).
 *
 * 1. `newsletter_last_entry_id` — l'id de la DERNIÈRE entrée de changelog déjà
 *    envoyée à cet utilisateur. C'est le marqueur qui rend l'envoi idempotent :
 *    on n'expédie que le delta au-dessus de ce repère, donc jamais deux fois la
 *    même nouveauté, et un lecteur à jour ne reçoit RIEN (pas d'e-mail creux).
 *    NULL = jamais servi : le premier passage POSE le repère sans envoyer, pour
 *    qu'un compte existant ne reçoive pas les 75 entrées de l'historique d'un
 *    coup. Volontairement du TEXT libre et PAS une FK : le catalogue vit dans
 *    le code (`@bellum/contracts`), pas en base — une entrée retirée du
 *    catalogue laisse un repère orphelin que le service sait traiter (il
 *    re-pose le repère et n'envoie rien) plutôt qu'une contrainte violée.
 *
 * 2. `email_language` — la langue d'interface de l'utilisateur, reportée par la
 *    SPA. Les libellés du changelog existent en FR et en EN ; sans cette
 *    colonne l'API n'a aucun moyen de savoir laquelle lire. NULL = inconnue →
 *    le service retombe sur le défaut produit (FR), jamais sur une devinette.
 *
 * Additif et idempotent (`IF NOT EXISTS`) : aucune ligne existante n'est
 * touchée, aucune valeur par défaut n'invente une langue ni un historique de
 * lecture. Pas de changement de RLS — `notification_preferences` est déjà
 * scopée à son propriétaire.
 */
export class ChangelogNewsletterDelivery1787961843527 implements MigrationInterface {
  public name = 'ChangelogNewsletterDelivery1787961843527'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE notification_preferences
        ADD COLUMN IF NOT EXISTS newsletter_last_entry_id text,
        ADD COLUMN IF NOT EXISTS email_language text
    `)

    // La langue est un ENUM métier de fait (les deux langues de l'UI). Un CHECK
    // plutôt qu'un type Postgres : ajouter une langue restera un ALTER ... CHECK,
    // et une valeur parasite (« fr-FR », « de ») est rejetée à l'écriture au lieu
    // de faire silencieusement retomber l'envoi en FR.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'notification_preferences_email_language_check'
        ) THEN
          ALTER TABLE notification_preferences
            ADD CONSTRAINT notification_preferences_email_language_check
            CHECK (email_language IS NULL OR email_language IN ('fr', 'en'));
        END IF;
      END $$;
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
