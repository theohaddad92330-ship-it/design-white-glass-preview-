import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LE DÉLAI DE RÈGLEMENT — « à 60 jours fin de mois » (panneau de planification,
 * PDF-22 §7).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE, ET CE QU'IL NE FAUT PAS CONFONDRE
 * ─────────────────────────────────────────────────────────────────────────────
 * `invoice_readiness.due_on` (migration antérieure) porte l'échéance d'UNE
 * facture précise, une fois qu'elle existe — un fait ponctuel. Cette migration
 * ajoute la CONDITION contractuelle qui la produira : le délai négocié avec le
 * client, vrai avant toute facture et qui ne change pas d'un mois sur l'autre.
 * Les deux colonnes ne se substituent pas l'une à l'autre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX COLONNES, PAS UNE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un délai seul ne dit pas quand il commence à courir : « 60 jours » depuis la
 * date de facture n'est pas la même échéance que « 60 jours fin de mois ».
 * `payment_terms_basis` porte ce point de départ, contraint à deux valeurs
 * connues du produit — un `CHECK` élargi AVANT tout code qui y écrirait une
 * troisième valeur, jamais après (GA-11/GA-12).
 *
 * Les deux colonnes vivent sur `mission_commercial_terms`, comme le reste des
 * conditions commerciales de la mission — pas sur `missions` : une donnée dont
 * l'accès diffère du reste de la ligne se protège mal quand elle vit dans la
 * même ligne (raison déjà écrite sur cette table).
 */
export class MissionCommercialTermsPaymentTerms1790981000002 implements MigrationInterface {
  public name = 'MissionCommercialTermsPaymentTerms1790981000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms
        ADD COLUMN IF NOT EXISTS payment_terms_days integer,
        ADD COLUMN IF NOT EXISTS payment_terms_basis text
    `)
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms
        ADD CONSTRAINT chk_mission_commercial_terms_payment_terms_days
          CHECK (payment_terms_days IS NULL OR payment_terms_days >= 0)
    `)
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms
        ADD CONSTRAINT chk_mission_commercial_terms_payment_terms_basis
          CHECK (payment_terms_basis IS NULL OR payment_terms_basis IN ('invoice_date', 'end_of_month'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms
        DROP CONSTRAINT IF EXISTS chk_mission_commercial_terms_payment_terms_basis
    `)
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms
        DROP CONSTRAINT IF EXISTS chk_mission_commercial_terms_payment_terms_days
    `)
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms
        DROP COLUMN IF EXISTS payment_terms_basis,
        DROP COLUMN IF EXISTS payment_terms_days
    `)
  }
}
