import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La commission d'un intermédiaire, et l'annulation d'un « facturé ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. `partner_commission_daily_cents`
 * ─────────────────────────────────────────────────────────────────────────────
 * Le coût d'une mission tenait en UNE colonne saisie à la main,
 * `loaded_daily_cost_cents`. Pour un salarié c'est juste. Pour une mission
 * passée par un partenaire ou un sous-traitant, le coût réel est le TJM d'achat
 * **plus la commission** de l'intermédiaire — et rien ne portait cette seconde
 * moitié.
 *
 * Conséquence mesurable : la marge de toute mission en `partner` ou
 * `subcontracting` était SURÉVALUÉE, et c'est ce chiffre qui alimente la marge
 * par canal et l'alerte de seuil. Autrement dit, le calcul censé dire « passer
 * par un intermédiaire coûte N points » était faussé du montant même qu'il
 * cherche à mesurer.
 *
 * En CENTIMES et par JOUR, comme le coût qu'elle complète — un pourcentage
 * obligerait à choisir sur quelle base, et deux lectures ne choisiraient pas la
 * même. `NULL` = non renseignée, jamais 0 : « pas de commission » et « on ne
 * sait pas » ne mènent pas à la même décision, et c'est toute la discipline du
 * module.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 2. `invoice_cancelled_at` / `invoice_cancelled_reason` / `_by`
 * ─────────────────────────────────────────────────────────────────────────────
 * « Marquer comme facturé » était un ALLER SIMPLE : aucune route inverse,
 * aucun avertissement. Un mois marqué par erreur sortait définitivement des
 * relances — le client ne paie pas, personne ne le relance, et rien ne le dit.
 *
 * On n'EFFACE pas la marque : on l'annule en gardant sa trace. Effacer
 * `invoiced_at` ferait disparaître le fait qu'une facture a été annoncée, et
 * c'est précisément ce qu'il faut pouvoir relire.
 */
export class PartnerCommissionAndPayment1790060000001 implements MigrationInterface {
  name = 'PartnerCommissionAndPayment1790060000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms
        ADD COLUMN IF NOT EXISTS partner_commission_daily_cents bigint
    `)
    await queryRunner.query(`
      ALTER TABLE invoice_readiness
        ADD COLUMN IF NOT EXISTS invoice_cancelled_at timestamptz,
        ADD COLUMN IF NOT EXISTS invoice_cancelled_reason text,
        ADD COLUMN IF NOT EXISTS invoice_cancelled_by uuid
    `)
    // Un motif est OBLIGATOIRE quand on annule : une annulation sans raison est
    // exactement ce qu'on ne saura pas relire dans six mois. La contrainte le
    // dit en base, pas seulement dans un service.
    await queryRunner.query(`
      ALTER TABLE invoice_readiness
        ADD CONSTRAINT invoice_cancel_reason_check
        CHECK (invoice_cancelled_at IS NULL OR length(coalesce(invoice_cancelled_reason, '')) > 0)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoice_readiness DROP CONSTRAINT IF EXISTS invoice_cancel_reason_check
    `)
    await queryRunner.query(`
      ALTER TABLE invoice_readiness
        DROP COLUMN IF EXISTS invoice_cancelled_at,
        DROP COLUMN IF EXISTS invoice_cancelled_reason,
        DROP COLUMN IF EXISTS invoice_cancelled_by
    `)
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms DROP COLUMN IF EXISTS partner_commission_daily_cents
    `)
  }
}
