import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `invoiced_declared` — #2197.41, décision Louis 21/09/2026.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * `MarkInvoicedDialog` (`InvoiceReadinessPanel.tsx`) laisse un commercial
 * écrire « facturé », À LA MAIN, sans AUCUNE preuve de connecteur —
 * `InvoiceReadinessService.markInvoiced` écrivait `state = 'invoiced'`. C'est
 * le SEUL chemin qui ait jamais écrit cette colonne : aucun connecteur ne l'a
 * jamais confirmée. Le chiffre « FACTURÉ » de `RevenueService` (`kind:
 * 'invoiced'`) comptait donc, depuis l'origine, une déclaration humaine comme
 * si elle avait été prouvée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DÉCISION
 * ─────────────────────────────────────────────────────────────────────────────
 * « facturé » (prouvé par le connecteur de l'outil branché par le client) et
 * « déclaré facturé par `<personne>` le `<date>`, non confirmé » deviennent
 * deux états DISTINCTS. Ce n'est PAS un revirement de #2564 (« facturé » ne
 * s'écrit toujours que sur preuve de connecteur) : c'est cesser de confondre
 * une déclaration humaine avec cette preuve, en la NOMMANT au lieu de
 * l'interdire.
 *
 * ⚠️ La contrainte est élargie AVANT le code qui écrit la valeur (GA-11/GA-12,
 * la leçon d'`account_vocabulary.kind`). Le BACKFILL suit dans le même sens :
 * puisqu'aucun chemin d'écriture ne pose de preuve de connecteur aujourd'hui,
 * TOUTE ligne `invoiced` déjà écrite est, en réalité, une déclaration — la
 * laisser à `'invoiced'` continuerait de la compter comme prouvée dans le
 * chiffre d'affaires facturé.
 */
export class InvoiceReadinessDeclared1795725508247 implements MigrationInterface {
  name = 'InvoiceReadinessDeclared1795725508247'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoice_readiness DROP CONSTRAINT IF EXISTS invoice_readiness_state_check
    `)
    await queryRunner.query(`
      ALTER TABLE invoice_readiness
        ADD CONSTRAINT invoice_readiness_state_check
        CHECK (state IN ('blocked', 'ready', 'invoiced', 'not_due', 'invoiced_declared'))
    `)
    // Backfill : aucune ligne `invoiced` déjà écrite ne porte de preuve de
    // connecteur — elle est rebasculée en DÉCLARATION.
    await queryRunner.query(`UPDATE invoice_readiness SET state = 'invoiced_declared' WHERE state = 'invoiced'`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rétrécir une contrainte casse les lignes déjà écrites : on les ramène
    // d'abord à `invoiced`, qui est l'état historique — les perdre en silence
    // serait pire (même règle que `InvoiceReadinessNotDue1790050000001`).
    await queryRunner.query(`UPDATE invoice_readiness SET state = 'invoiced' WHERE state = 'invoiced_declared'`)
    await queryRunner.query(`
      ALTER TABLE invoice_readiness DROP CONSTRAINT IF EXISTS invoice_readiness_state_check
    `)
    await queryRunner.query(`
      ALTER TABLE invoice_readiness
        ADD CONSTRAINT invoice_readiness_state_check
        CHECK (state IN ('blocked', 'ready', 'invoiced', 'not_due'))
    `)
  }
}
