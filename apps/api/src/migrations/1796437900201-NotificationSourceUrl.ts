import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3922.n — LA NOTIFICATION « NOUVEAU SIGNAL » PORTE ELLE-MÊME SA PREUVE.
 *
 * Elle ne renvoyait que vers `/accounts/:id?tab=veille` : pour vérifier le fait
 * annoncé, il fallait ouvrir le compte, retrouver le signal, puis cliquer son
 * lien. `source_url` est l'URL http(s) VÉRIFIABLE du signal cité (posée par le
 * pipeline, `stamp_signal_urls`, lue par `readRecentSignals`) ; `source_kind`
 * son genre (`press` | `bodacc` | `job` | `tender` | `official` | `other`), qui
 * nomme le lien (« Voir l'annonce BODACC »).
 *
 * GA-11/GA-12 : les colonnes précèdent le code qui les écrit
 * (`NotificationsService.createNotification`). NULLABLE, sans défaut : une
 * notification sans signal cité, ou dont le signal n'a pas d'URL, n'en gagne
 * jamais une devinée — l'écran dit « Sans lien vérifiable ».
 */
export class NotificationSourceUrl1796437900201 implements MigrationInterface {
  public name = 'NotificationSourceUrl1796437900201'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS source_url text`)
    await queryRunner.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS source_kind text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS source_kind`)
    await queryRunner.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS source_url`)
  }
}
