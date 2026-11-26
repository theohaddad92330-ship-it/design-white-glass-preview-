import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LUDOVIC-C LC.1 (19/10/2026) — LA DATE DE LA REMISE AUX RÈGLES ACTUELLES DU SEGMENT CONTACTS.
 *
 * Le filtre d'homonymes (LUDB.5) ne s'appliquait qu'aux nouvelles collectes : la fiche STILL
 * (1467 contacts collectés avant) gardait stillfront.com. Le geste « Remettre les contacts à jour
 * avec les règles actuelles » repasse les règles sur l'EXISTANT, sans recollecte ni crédit — donc
 * sans toucher `contacts_collected_at` (ce serait prétendre une collecte qui n'a pas eu lieu,
 * même faute que `addressability_relation_collected_at`, migration `1795716734279`).
 *
 * Additive : `timestamptz`, NULLABLE, `IF NOT EXISTS`. `NULL` = règles jamais repassées sur
 * l'existant. Seul écrivain : `ContactsService.applyCurrentContactRules`.
 */
export class ContactsRulesAppliedAt1796560598667 implements MigrationInterface {
  public name = 'ContactsRulesAppliedAt1796560598667'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS contacts_rules_applied_at timestamptz NULL`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
