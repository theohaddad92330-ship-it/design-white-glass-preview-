import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `consultants.cv_auto_read_at` — lecture automatique des CV à l'import
 * (04/10/2026, import ZIP de 688 CV ; arbitrage `c88_lecture_auto_cv_import`).
 *
 * La date de la dernière LECTURE AUTOMATIQUE du CV par le modèle (file
 * `cv-auto-parse`). `null` = jamais lu : c'est ce qui définit « CV non lu »
 * pour le rattrapage ciblé (« Lire les CV non lus ») et le compteur du vivier.
 * Une lecture qui n'a rien produit d'exploitable pose quand même la date —
 * la rejouer à chaque clic ne produirait rien de plus. Un service IA
 * injoignable ne la pose PAS : la fiche reste « non lue », donc rattrapable.
 *
 * Migration ADDITIVE : aucune ligne réécrite, aucune contrainte.
 */
export class ConsultantCvAutoReadAt1796432163481 implements MigrationInterface {
  public name = 'ConsultantCvAutoReadAt1796432163481'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS cv_auto_read_at timestamptz NULL`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
