import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LE LITIGE ET LES RELANCES D'UNE FACTURE SUR FACTURE (#1655, 07/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * #1655 demande : « aucune relance sur une facture EN LITIGE », et son test est
 * « facture marquée en litige → aucune relance proposée ». Or l'état « en
 * litige » N'EXISTAIT PAS sur `manual_billing_invoices` : `payment_status` ne
 * connaît que `unpaid` et `paid`. Un client qui CONTESTE sa facture était donc
 * enregistré, en base, exactement comme un client qui ne l'a pas payée — c'est
 * la même ligne, inchangée — et une cadence de relance branchée dessus lui
 * aurait redemandé son argent tous les quinze jours pendant qu'il conteste.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI TROIS COLONNES ET PAS UNE VALEUR DE `payment_status`
 * ─────────────────────────────────────────────────────────────────────────────
 * Parce que **le litige n'est pas un statut de paiement**. Une facture contestée
 * EST impayée : les deux faits coexistent, et les écrire dans la même colonne
 * les rendrait mutuellement exclusifs — on ne saurait plus si une facture
 * `disputed` a été réglée entre-temps. `payment_status` n'est donc PAS touché
 * (aucune valeur ajoutée, aucune contrainte élargie, GA-08 sans objet ici).
 *
 * C'est aussi, mot pour mot, le modèle que le produit CLIENT applique déjà sur
 * `invoice_readiness` (migrations `1789693128476` et `1790170000001`) : trois
 * colonnes, deux contraintes, et une seule dérivation partagée
 * (`isDisputeOpen`). Un second modèle du litige dans le même dépôt aurait
 * divergé du premier à la première évolution.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA MIGRATION FAIT
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. `disputed_at` / `dispute_reason` / `dispute_resolved_at` — le litige, son
 *     motif OBLIGATOIRE et sa levée. On n'efface pas `disputed_at` en levant :
 *     « on archive, on ne supprime pas », et un litige levé reste un fait qui
 *     explique un retard de paiement.
 *  2. `reminders` — l'historique des relances CONSIGNÉES : `[{ at, by, tone,
 *     index }]`. C'est la règle 4 de #1655 (« chaque relance est journalisée
 *     avec sa date et son auteur »), et elle vit SUR LA FACTURE plutôt que dans
 *     un second journal : le journal d'actions unique du back-office est #1666,
 *     livré à côté, et deux journaux qui racontent le même geste finissent par
 *     se contredire.
 *
 *     ⚠️ Un TABLEAU et pas un compteur. `reminders_sent` seul aurait perdu la
 *     date et l'auteur de tout ce qui n'est pas la dernière relance, et le rang
 *     se DÉRIVE de la longueur — deux colonnes à tenir cohérentes divergent.
 *     Le défaut par défaut est `'[]'` et non `NULL` : « aucune relance » est un
 *     fait connu, pas une absence de mesure.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE N'INVENTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  · Aucun backfill de litige. Un litige est une DÉCLARATION humaine ; le
 *    deviner à partir d'un retard de paiement fabriquerait un fait faux avec
 *    l'autorité d'une colonne, et suspendrait des relances légitimes.
 *  · Aucun backfill de relance. Les relances déjà envoyées à la main par
 *    l'opérateur ne sont écrites nulle part ; les reconstituer donnerait des
 *    dates devinées. Les factures existantes repartent donc au rang 1, ce qui
 *    est la vérité : aucune relance n'est consignée.
 *
 * ⚠️ RIEN ICI N'ENVOIE QUOI QUE CE SOIT. Ces colonnes servent à PRÉPARER un
 * message et à consigner qu'un humain l'a envoyé. Aucun transport, aucune file
 * d'envoi, aucun déclencheur.
 */
export class ManualBillingInvoiceDisputeAndReminders1791823551000 implements MigrationInterface {
  name = 'ManualBillingInvoiceDisputeAndReminders1791823551000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ⚠️ DEUX instructions, et ce n'est pas une coquetterie : mêler des colonnes
    // NULLABLES et une colonne NOT NULL dans le MÊME `ALTER TABLE` fait lire à
    // GA-129 le `NOT NULL` de la dernière comme s'il portait sur la première —
    // sa lecture s'arrête au point-virgule, pas à la virgule. La garde avait
    // raison de rougir sur la forme ; la réponse est d'écrire le SQL de façon
    // qu'il ne puisse pas se lire de travers, pas d'élargir la garde.
    await queryRunner.query(`
      ALTER TABLE manual_billing_invoices
        ADD COLUMN IF NOT EXISTS disputed_at timestamptz,
        ADD COLUMN IF NOT EXISTS dispute_reason text,
        ADD COLUMN IF NOT EXISTS dispute_resolved_at timestamptz
    `)
    await queryRunner.query(`
      ALTER TABLE manual_billing_invoices
        ADD COLUMN IF NOT EXISTS reminders jsonb NOT NULL DEFAULT '[]'::jsonb
    `)

    // Le motif est OBLIGATOIRE dès qu'un litige est déclaré : « en litige »
    // sans rien d'autre ne se relit pas dans six mois, et c'est précisément ce
    // qu'il faut pouvoir relire pour décider quoi faire de la facture.
    await queryRunner.query(`
      ALTER TABLE manual_billing_invoices
        DROP CONSTRAINT IF EXISTS manual_billing_invoices_dispute_reason_check
    `)
    await queryRunner.query(`
      ALTER TABLE manual_billing_invoices
        ADD CONSTRAINT manual_billing_invoices_dispute_reason_check
        CHECK (disputed_at IS NULL OR length(coalesce(dispute_reason, '')) > 0)
    `)

    // Un litige LEVÉ sans litige DÉCLARÉ n'a pas de sens — et se lirait comme
    // « pas de litige », ce qui redémarrerait la cadence sur une ligne dont on
    // ne sait rien.
    await queryRunner.query(`
      ALTER TABLE manual_billing_invoices
        DROP CONSTRAINT IF EXISTS manual_billing_invoices_dispute_resolved_check
    `)
    await queryRunner.query(`
      ALTER TABLE manual_billing_invoices
        ADD CONSTRAINT manual_billing_invoices_dispute_resolved_check
        CHECK (dispute_resolved_at IS NULL OR disputed_at IS NOT NULL)
    `)

    // `reminders` est un TABLEAU. Un objet ou une chaîne y passerait sans la
    // contrainte, et la dérivation du rang (`length`) rendrait alors n'importe
    // quoi — un rang faux, c'est un ton faux dans une relance client.
    await queryRunner.query(`
      ALTER TABLE manual_billing_invoices
        DROP CONSTRAINT IF EXISTS manual_billing_invoices_reminders_array_check
    `)
    await queryRunner.query(`
      ALTER TABLE manual_billing_invoices
        ADD CONSTRAINT manual_billing_invoices_reminders_array_check
        CHECK (jsonb_typeof(reminders) = 'array')
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE manual_billing_invoices
        DROP CONSTRAINT IF EXISTS manual_billing_invoices_reminders_array_check,
        DROP CONSTRAINT IF EXISTS manual_billing_invoices_dispute_resolved_check,
        DROP CONSTRAINT IF EXISTS manual_billing_invoices_dispute_reason_check
    `)
    await queryRunner.query(`
      ALTER TABLE manual_billing_invoices
        DROP COLUMN IF EXISTS reminders,
        DROP COLUMN IF EXISTS dispute_resolved_at,
        DROP COLUMN IF EXISTS dispute_reason,
        DROP COLUMN IF EXISTS disputed_at
    `)
  }
}
