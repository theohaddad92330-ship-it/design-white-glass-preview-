import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `invoice_readiness.last_reminder_message_id` — #2419.8.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * `recordReminder` (`InvoiceReadinessService`) consigne qu'un commercial a
 * relancé un client, à la main, sans AUCUNE preuve de connecteur — un geste
 * déclaratif humain (doctrine `c31_relance_encaissement`, « rien ne part tout
 * seul » ; « Fait ne porte jamais de preuve d'envoi », Louis 21/09/2026).
 * `InvoiceReadinessTable.tsx` le dit déjà honnêtement (« N relance(s)
 * consignée(s) »), mais rien dans le MODÈLE ne portait la distinction : sans
 * colonne pour une preuve de connecteur, l'écran ne pouvait dire « consignée »
 * que par une chaîne figée, jamais en lisant un fait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA MIGRATION AJOUTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une colonne NULLABLE, additive : `last_reminder_message_id`. Elle reste
 * TOUJOURS `null` après cette migration — aucun chemin d'écriture ne la
 * renseigne, parce qu'aucun connecteur de messagerie n'atteint cet écran
 * aujourd'hui (`c31` l'exclut). La distinction devient RÉELLE dans le modèle
 * (une carte n'est « envoyée » que si cette colonne est renseignée, jamais un
 * autre chemin) sans qu'aucune capacité d'envoi ne soit ouverte : c'est très
 * exactement la même prudence que `InvoiceReadinessDeclared1795725508247`
 * (« facturé » ne s'écrit que sur preuve de connecteur, jamais deviné).
 *
 * ⚠️ Aucun backfill : aucune relance déjà consignée n'a de `message_id` à
 * retrouver — lui en inventer un serait la donnée fictive que la doctrine
 * interdit.
 */
export class InvoiceReadinessReminderMessageId1795999548769 implements MigrationInterface {
  name = 'InvoiceReadinessReminderMessageId1795999548769'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoice_readiness
        ADD COLUMN IF NOT EXISTS last_reminder_message_id text
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoice_readiness
        DROP COLUMN IF EXISTS last_reminder_message_id
    `)
  }
}
