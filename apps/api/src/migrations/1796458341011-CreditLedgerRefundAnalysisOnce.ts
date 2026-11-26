import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4123 — un débit d'analyse ne se rembourse JAMAIS deux fois, et c'est la base
 * qui le tient.
 *
 * `CreditsService.refundAnalysisSlot` lisait le registre puis écrivait, sans
 * verrou : l'annulation utilisateur et le `onFailed` du worker, simultanés sur
 * le même run, lisaient tous deux « 8 crédits restent à rendre » et rendaient
 * chacun 8. La ligne `refund_analysis` porte maintenant l'id du débit qu'elle
 * solde (`refunds_ledger_id`) ; cet index PARTIEL refuse une seconde ligne pour
 * le même débit, et le service n'ajuste le compteur que s'il a gagné
 * l'insertion (`ON CONFLICT DO NOTHING`).
 *
 * ADDITIF et sans risque de violation : la colonne naît NULLE sur toutes les
 * lignes existantes et l'index ne couvre que `refunds_ledger_id IS NOT NULL` —
 * aucun historique n'est concerné (pas de backfill : on ne devine pas quel
 * débit un ancien remboursement soldait). Des remboursements de runs différents
 * portent des débits différents : ils restent autorisés.
 *
 * Posée AVANT le code qui l'écrit (GA-11 / GA-12).
 */
export class CreditLedgerRefundAnalysisOnce1796458341011 implements MigrationInterface {
  public name = 'CreditLedgerRefundAnalysisOnce1796458341011'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE credit_ledger ADD COLUMN IF NOT EXISTS refunds_ledger_id uuid`)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_refund_analysis_once_idx
      ON credit_ledger (refunds_ledger_id)
      WHERE kind = 'refund_analysis' AND refunds_ledger_id IS NOT NULL
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
