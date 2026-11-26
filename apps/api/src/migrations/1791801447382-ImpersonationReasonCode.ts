import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le motif d'une incarnation devient un CODE de catalogue (#1670).
 *
 * ⚠️ LA CONTRAINTE EST POSÉE AVANT LE CODE QUI ÉCRIT LA VALEUR (GA-11 / GA-12).
 * C'est la règle du dépôt, et elle a été payée deux fois : le 21/07 sur
 * `account_vocabulary.kind` (des dossiers complets marqués « erreur »), le
 * 22/08 sur `accounts.status`.
 *
 * ⚠️ LA COLONNE EST NULLABLE, ET C'EST LA SEULE ISSUE HONNÊTE.
 * Les lignes déjà écrites portent un motif en TEXTE LIBRE. Aucune règle ne peut
 * déduire de « suite au ticket 4412 » lequel des trois codes il faut : leur
 * donner une valeur serait inventer une donnée. Un fait qu'on n'a pas reste
 * inconnu — il ne devient pas « support demandé » par défaut. Les lignes neuves
 * portent toujours un code ; c'est le DTO qui l'exige, pas la base.
 *
 * `reason` reste `NOT NULL` et garde le LIBELLÉ lisible du motif. Ce n'est pas
 * un doublon du code : c'est ce que lit un humain qui ouvre le journal sans
 * connaître le catalogue, et c'est la colonne sur laquelle six mois de lignes
 * historiques sont déjà écrites.
 */
export class ImpersonationReasonCode1791801447382 implements MigrationInterface {
  public name = 'ImpersonationReasonCode1791801447382'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE impersonation_audit
        ADD COLUMN IF NOT EXISTS reason_code text
    `)

    await queryRunner.query(`
      ALTER TABLE impersonation_audit
        DROP CONSTRAINT IF EXISTS impersonation_audit_reason_code_check
    `)

    await queryRunner.query(`
      ALTER TABLE impersonation_audit
        ADD CONSTRAINT impersonation_audit_reason_code_check
        CHECK (reason_code IS NULL OR reason_code IN ('support_demande', 'incident_constate', 'verification_technique'))
    `)

    // Le journal se lit par motif — « combien d'incarnations pour incident ce
    // mois-ci » est la question que le catalogue existe pour permettre.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_impersonation_audit_reason_code
        ON impersonation_audit (reason_code, created_at DESC)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
