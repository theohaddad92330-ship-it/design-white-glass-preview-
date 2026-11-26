import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * REVENUE PROTECTION (T8) — jusqu'à « prêt à facturer », pas un pas de plus.
 *
 * La table ne porte PAS de facture. Elle porte l'ÉTAT d'un mois : ce qui
 * l'empêche d'être facturé, combien de relances sont déjà parties, et — quand
 * c'est le cas — le fait que quelqu'un l'a facturé AILLEURS, dans son outil
 * comptable. C'est cette dernière colonne qui évite de relancer un client qui a
 * déjà payé.
 *
 * Ce qui est délibérément ABSENT : numéro de facture, TVA, montant dû, échéance
 * de paiement. Une facture engage une numérotation continue et une obligation de
 * conservation ; un produit qui en produirait « pour aider » créerait des
 * documents que personne ne pourrait ni corriger ni annuler proprement.
 *
 * `blockers` est un `jsonb` recalculé à chaque lecture et stocké pour la trace :
 * ce sont les BLOQUEURS QU'ON A VUS au moment de la relance, et c'est ce qu'il
 * faut pouvoir relire quand le client dit « personne ne m'a rien demandé ».
 */
export class InvoiceReadiness1789396183472 implements MigrationInterface {
  public name = 'InvoiceReadiness1789396183472'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoice_readiness (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        period_month date NOT NULL,
        state text NOT NULL DEFAULT 'blocked',
        blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
        prepared_amount_cents bigint,
        invoiced_at timestamptz,
        invoiced_by uuid,
        reminders_sent integer NOT NULL DEFAULT 0,
        last_reminder_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT invoice_readiness_state_check CHECK (state IN ('blocked', 'ready', 'invoiced'))
      )
    `)
    // Un seul état par mission et par mois : deux lignes rendraient le compteur
    // de relances non déterministe, et on relancerait deux fois.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS invoice_readiness_unique ON invoice_readiness (mission_id, period_month)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS invoice_readiness_workspace_idx
        ON invoice_readiness (workspace_id, period_month, state)
    `)

    // Le bon de commande n'est pas exigé partout : certains clients facturent
    // sans, d'autres refusent la facture sans lui. Le drapeau vit sur les
    // conditions commerciales, à côté du numéro qu'il rend obligatoire.
    await queryRunner.query(
      `ALTER TABLE mission_commercial_terms ADD COLUMN IF NOT EXISTS requires_po boolean NOT NULL DEFAULT false`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE mission_commercial_terms DROP COLUMN IF EXISTS requires_po`)
    await queryRunner.query(`DROP TABLE IF EXISTS invoice_readiness`)
  }
}
