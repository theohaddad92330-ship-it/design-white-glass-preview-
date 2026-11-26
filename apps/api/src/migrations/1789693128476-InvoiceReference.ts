import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Ce qu'un « marqué comme facturé » doit garder (PDF 5 §8, exigence 128).
 *
 * Le geste n'enregistrait qu'une DATE. Six mois plus tard, personne ne sait
 * quelle facture couvrait ce mois, ni pour quel montant, ni quand elle était
 * due — donc aucun retard n'est calculable, et l'écran Paiements du §11 n'a
 * aucune source.
 *
 * Les trois colonnes restent NULL quand elles ne sont pas fournies. Inventer
 * une échéance ferait apparaître un impayé au bout de trente jours pour une
 * facture dont personne n'a dit quand elle était due — la pire donnée possible
 * dans un module qui sert à réclamer de l'argent.
 */
export class InvoiceReference1789693128476 implements MigrationInterface {
  public name = 'InvoiceReference1789693128476'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoice_readiness
        ADD COLUMN IF NOT EXISTS invoice_reference text,
        ADD COLUMN IF NOT EXISTS invoiced_amount_cents bigint,
        ADD COLUMN IF NOT EXISTS due_on date,
        ADD COLUMN IF NOT EXISTS paid_at timestamptz,
        ADD COLUMN IF NOT EXISTS paid_amount_cents bigint,
        ADD COLUMN IF NOT EXISTS disputed_at timestamptz,
        ADD COLUMN IF NOT EXISTS dispute_reason text
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoice_readiness
        DROP COLUMN IF EXISTS invoice_reference,
        DROP COLUMN IF EXISTS invoiced_amount_cents,
        DROP COLUMN IF EXISTS due_on,
        DROP COLUMN IF EXISTS paid_at,
        DROP COLUMN IF EXISTS paid_amount_cents,
        DROP COLUMN IF EXISTS disputed_at,
        DROP COLUMN IF EXISTS dispute_reason
    `)
  }
}
