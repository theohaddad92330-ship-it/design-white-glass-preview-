import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LES TROIS ANNONCES D'ENGAGEMENT — #2082.4 / .5 / .6.
 *
 * « Rendez-vous à préparer », « Fin de mission », « Réponse client » : trois
 * préférences IN-APP, posées le 16/09/2026 EN MÊME TEMPS que leur émetteur
 * (`engagement-alerts.service.ts`). L'ordre était la décision : l'ÉMETTEUR
 * d'abord, la préférence ensuite — un interrupteur qui ne commande rien promet
 * un envoi qui n'arrivera jamais, et le dépôt porte déjà cette dette une fois
 * (`changelog`, type déclaré sans émetteur).
 *
 * Défaut `true`, comme `action_overdue` et pour la même raison : rien ne PART
 * chez personne (c'est la cloche), et chacune annonce un engagement DÉJÀ pris —
 * un rendez-vous qui est dans ton agenda, une mission qui se termine, une
 * réponse que quelqu'un t'a envoyée. Aucune des trois n'est un envoi sortant,
 * donc aucune n'est une case précochée au sens de #2082.16.
 *
 * Additive, idempotente, et posée AVANT le code qui écrit (GA-11 / GA-12).
 * Aucune contrainte à élargir : `notifications.type` est du texte libre, seul
 * `notifications_origin_check` existe sur cette table.
 */
export class NotificationEngagementAlerts1795099617402 implements MigrationInterface {
  public name = 'NotificationEngagementAlerts1795099617402'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE notification_preferences
        ADD COLUMN IF NOT EXISTS meeting_prep boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS mission_end boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS client_reply boolean NOT NULL DEFAULT true
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
