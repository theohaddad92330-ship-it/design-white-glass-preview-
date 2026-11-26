import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le litige d'une facture — BEL-MIS-011, « le litige n'est pas un retard ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT, ET CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * `disputed_at` et `dispute_reason` sont posées depuis la migration
 * `1789693128476`, et l'entité écrit noir sur blanc ce qu'elles doivent
 * produire : « les relances s'arrêtent, mais la ligne reste ». Aucun chemin ne
 * les a jamais écrites. Un litige se gérait donc en annulant le « facturé » —
 * après quoi le mois repartait dans les relances, c'est-à-dire qu'on relançait
 * un client qui conteste.
 *
 * Deux ajouts, aucun renommage.
 *
 * 1. **`dispute_resolved_at`** — le geste inverse. On n'efface PAS `disputed_at`
 *    quand un litige se règle : effacer ferait disparaître le fait qu'une
 *    facture a été contestée, et c'est justement ce qu'il faut relire six mois
 *    plus tard pour comprendre un encaissement à quatre mois. « Levé » est donc
 *    une DATE de plus, jamais une remise à zéro.
 *
 * 2. **`invoice_dispute_reason_check`** — le motif est OBLIGATOIRE, exactement
 *    comme pour l'annulation d'un « facturé » (`invoice_cancel_reason_check`,
 *    migration `1790060000001`) et pour la même raison : « en litige » sans rien
 *    d'autre ne se relit pas. La contrainte le tient en BASE et pas seulement
 *    dans un service — c'est la règle du dépôt : toute valeur qui voyage du code
 *    vers la base voit sa contrainte posée AVANT le code qui l'écrit.
 *
 * `invoice_dispute_resolution_check` interdit le troisième état impossible : un
 * litige levé sans litige déclaré. Une ligne qui porterait `dispute_resolved_at`
 * seul se lirait « ce litige est clos » alors que personne n'en a jamais ouvert.
 */
export class InvoiceDispute1790170000001 implements MigrationInterface {
  name = 'InvoiceDispute1790170000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoice_readiness
        ADD COLUMN IF NOT EXISTS dispute_resolved_at timestamptz
    `)
    await queryRunner.query(`
      ALTER TABLE invoice_readiness
        DROP CONSTRAINT IF EXISTS invoice_dispute_reason_check
    `)
    await queryRunner.query(`
      ALTER TABLE invoice_readiness
        ADD CONSTRAINT invoice_dispute_reason_check
        CHECK (disputed_at IS NULL OR length(coalesce(dispute_reason, '')) > 0)
    `)
    await queryRunner.query(`
      ALTER TABLE invoice_readiness
        DROP CONSTRAINT IF EXISTS invoice_dispute_resolution_check
    `)
    await queryRunner.query(`
      ALTER TABLE invoice_readiness
        ADD CONSTRAINT invoice_dispute_resolution_check
        CHECK (dispute_resolved_at IS NULL OR disputed_at IS NOT NULL)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoice_readiness DROP CONSTRAINT IF EXISTS invoice_dispute_resolution_check
    `)
    await queryRunner.query(`
      ALTER TABLE invoice_readiness DROP CONSTRAINT IF EXISTS invoice_dispute_reason_check
    `)
    await queryRunner.query(`
      ALTER TABLE invoice_readiness DROP COLUMN IF EXISTS dispute_resolved_at
    `)
  }
}
