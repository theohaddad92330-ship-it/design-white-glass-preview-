import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le compteur de proactivité (PDF 6 §7, ticket BEL-AUT-503).
 *
 * Deux colonnes et une table, chacune contre un accident précis :
 *
 *  - `notification_preferences.proactivity_cap` : le plafond RÉGLABLE par
 *    l'utilisateur (décision D40, entre 1 et 5, défaut 3). Par utilisateur et
 *    non par espace : un commercial et un recruteur n'ont pas la même tolérance
 *    au bruit, et c'est celui qui reçoit qui doit régler.
 *  - `notifications.origin` : d'où vient le message. C'est cette colonne qui
 *    décide s'il compte dans le plafond — un échec et une réponse à un geste
 *    de l'utilisateur passent toujours. Défaut `user_triggered` : tout ce qui
 *    existe déjà a été déclenché par quelqu'un, et le compter comme proactif
 *    ferait taire les vrais messages proactifs du premier jour.
 *  - `notifications.priority` : 0-100, `null` pour tout l'historique. `null` et
 *    non 0 — « pas de priorité calculée » n'est pas « priorité nulle », et la
 *    seconde signifie « ne jamais notifier ».
 *  - `proactivity_counters` : combien de messages proactifs ont DÉJÀ interrompu
 *    l'utilisateur aujourd'hui. La clé porte le jour LOCAL de l'utilisateur,
 *    comme les routines : un plafond calé sur le jour du serveur se réarmerait
 *    au milieu de l'après-midi pour la moitié des fuseaux.
 */
export class ProactivityCap1789781294638 implements MigrationInterface {
  public name = 'ProactivityCap1789781294638'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE notification_preferences
        ADD COLUMN IF NOT EXISTS proactivity_cap integer NOT NULL DEFAULT 3
    `)
    await queryRunner.query(`
      ALTER TABLE notification_preferences
        DROP CONSTRAINT IF EXISTS notification_preferences_proactivity_cap_check
    `)
    await queryRunner.query(`
      ALTER TABLE notification_preferences
        ADD CONSTRAINT notification_preferences_proactivity_cap_check
        CHECK (proactivity_cap BETWEEN 1 AND 5)
    `)

    await queryRunner.query(`
      ALTER TABLE notifications
        ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'user_triggered',
        ADD COLUMN IF NOT EXISTS priority integer,
        ADD COLUMN IF NOT EXISTS suppressed_at timestamptz
    `)
    await queryRunner.query(`ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_origin_check`)
    await queryRunner.query(`
      ALTER TABLE notifications ADD CONSTRAINT notifications_origin_check
        CHECK (origin IN ('proactive', 'failure', 'user_triggered'))
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS proactivity_counters (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        -- Le jour LOCAL de l'utilisateur, pas celui du serveur.
        local_day date NOT NULL,
        sent_count integer NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS proactivity_counters_unique
        ON proactivity_counters (user_id, local_day)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS proactivity_counters`)
    await queryRunner.query(`ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_origin_check`)
    await queryRunner.query(`
      ALTER TABLE notifications
        DROP COLUMN IF EXISTS origin,
        DROP COLUMN IF EXISTS priority,
        DROP COLUMN IF EXISTS suppressed_at
    `)
    await queryRunner.query(`
      ALTER TABLE notification_preferences
        DROP CONSTRAINT IF EXISTS notification_preferences_proactivity_cap_check
    `)
    await queryRunner.query(`ALTER TABLE notification_preferences DROP COLUMN IF EXISTS proactivity_cap`)
  }
}
