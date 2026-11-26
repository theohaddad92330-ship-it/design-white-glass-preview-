import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2961 (#2302.28, épopée Commercial Territory Resolver, tranché sans Louis) —
 * les comptes de référence NOMMÉS, structurés : la seule donnée réelle
 * voisine (`case_study_results`) est du texte libre (« Mission X reconduite
 * après douze mois ») dont aucun nom d'entreprise n'est extractible sans
 * invention (doctrine « jamais de donnée fictive », confirmé par les audits
 * du 26/09 et du 27/09/2026 sur ce même point). Colonne ADDITIVE, `text[]`
 * par défaut vide, même famille que `case_study_results`/`client_testimonials`
 * (migration `1794010756001`) : le questionnaire ne bloque jamais, une
 * question passée reste un tableau vide, jamais devinée.
 *
 * Élargie AVANT le code qui l'écrit (GA-11/GA-12).
 */
export class ReferenceAccounts1796342444031 implements MigrationInterface {
  name = 'ReferenceAccounts1796342444031'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS reference_accounts text[] DEFAULT '{}';
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS reference_accounts;
    `)
  }
}
