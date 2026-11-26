import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2566.2 — LA DATE DE VALIDITÉ DU BON DE COMMANDE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * `mission_commercial_terms` savait déjà porter le NUMÉRO, la DATE d'émission,
 * le MONTANT et le VOLUME d'un bon de commande (`1790900000009`) — jamais
 * jusqu'à QUAND il couvre. Sur une mission longue, un bon de commande expire en
 * cours de route et un nouveau le remplace ; sans cette date, rien ne pouvait
 * dire que le mois qu'on s'apprête à facturer tombe après l'échéance. Le client
 * bêta l'a nommé explicitement : « le numéro de bon de commande peut aussi
 * changer » — encore faut-il savoir QUAND il ne suffit plus.
 *
 * `date`, NULLABLE : un bon de commande sans échéance connue reste l'état
 * normal (contrats anciens, bons « jusqu'à nouvel ordre ») — le rendre
 * obligatoire transformerait « on ne sait pas encore » en une erreur de saisie,
 * exactement le défaut que `po_issued_on` avait déjà évité.
 */
export class MissionPurchaseOrderValidUntil1795670000000 implements MigrationInterface {
  public name = 'MissionPurchaseOrderValidUntil1795670000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms
        ADD COLUMN IF NOT EXISTS po_valid_until date
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms
        DROP COLUMN IF EXISTS po_valid_until
    `)
  }
}
