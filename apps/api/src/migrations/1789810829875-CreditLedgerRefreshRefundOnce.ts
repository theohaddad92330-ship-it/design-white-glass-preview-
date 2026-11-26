import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2650.2 (19/09/2026) — un débit de rafraîchissement indu ne se rembourse
 * JAMAIS deux fois, et c'est la base qui le tient.
 *
 * `RefreshRefundService` écrit, pour chaque débit `refresh:<axe>` pris moins
 * de 6 h après un débit de la même PHASE sur le même compte, UNE ligne
 * `refund_enrichment` dont le motif porte la référence du débit
 * (`refund:refresh-within-6h:<axe> (debit <uuid>)` —
 * `packages/contracts/src/schemas/refresh-refund.ts`). Le service vérifie
 * déjà la référence sous un verrou consultatif ; cet index est le filet
 * STRUCTUREL : une seconde ligne pour le même débit est refusée en base,
 * quel que soit le chemin qui tenterait de l'écrire.
 *
 * PARTIEL : il ne porte que sur ces lignes-là. Les autres motifs du registre
 * (nom d'entreprise, `plan:…`, `topup:…`) se répètent légitimement et ne
 * sont pas concernés. ADDITIF : aucune ligne existante ne porte ce préfixe
 * avant le premier geste — la création ne peut pas échouer sur un doublon.
 */
export class CreditLedgerRefreshRefundOnce1789810829875 implements MigrationInterface {
  public name = 'CreditLedgerRefreshRefundOnce1789810829875'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_refresh_refund_once_idx
      ON credit_ledger (reason)
      WHERE kind = 'refund_enrichment' AND reason LIKE 'refund:refresh-within-6h:%'
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
