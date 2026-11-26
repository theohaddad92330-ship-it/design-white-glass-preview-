import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LUDOVIC-D LC.10 — back-office /impersonations : « Terminer » une session en cours, et le motif
 * « Recette » + une précision libre facultative.
 *
 * ⚠️ LA CONTRAINTE EST ÉLARGIE AVANT LE CODE QUI ÉCRIT LA VALEUR (GA-11 / GA-12) : `recette`
 * entre dans `impersonation_audit_reason_code_check` ici, le DTO ne l'accepte qu'après.
 * Ajout EN FIN de catalogue (GA-08) ; aucune valeur ne disparaît.
 *
 * - `reason_detail` : la précision libre FACULTATIVE du motif (le catalogue reste ce qui se compte).
 *   Bornée à 300 caractères ; les lignes existantes restent `NULL` (rien n'est inventé).
 * - `ended_by` : sur une ligne `stop`, QUI a terminé quand ce n'est pas l'opérateur lui-même
 *   (un admin depuis la console). `NULL` = arrêt par l'opérateur, comme avant. Le journal reste
 *   append-only : terminer AJOUTE une ligne `stop`, ne modifie ni ne supprime rien.
 */
export class ImpersonationTerminateAndRecette1796560887818 implements MigrationInterface {
  public name = 'ImpersonationTerminateAndRecette1796560887818'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE impersonation_audit
        DROP CONSTRAINT IF EXISTS impersonation_audit_reason_code_check
    `)
    await queryRunner.query(`
      ALTER TABLE impersonation_audit
        ADD CONSTRAINT impersonation_audit_reason_code_check
        CHECK (reason_code IS NULL OR reason_code IN ('support_demande', 'incident_constate', 'verification_technique', 'recette'))
    `)
    await queryRunner.query(`ALTER TABLE impersonation_audit ADD COLUMN IF NOT EXISTS reason_detail text`)
    await queryRunner.query(`
      ALTER TABLE impersonation_audit
        DROP CONSTRAINT IF EXISTS impersonation_audit_reason_detail_length_check
    `)
    await queryRunner.query(`
      ALTER TABLE impersonation_audit
        ADD CONSTRAINT impersonation_audit_reason_detail_length_check
        CHECK (reason_detail IS NULL OR char_length(reason_detail) <= 300)
    `)
    await queryRunner.query(`ALTER TABLE impersonation_audit ADD COLUMN IF NOT EXISTS ended_by text`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
