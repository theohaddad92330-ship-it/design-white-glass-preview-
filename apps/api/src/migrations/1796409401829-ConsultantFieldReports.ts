import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3406 (retour bêta #3406) — capitaliser les informations TERRAIN remontées
 * par un consultant, avec consentement et sans le mettre en difficulté.
 *
 * Même patron que `interview_traits` (BEL-SC-238, #3267) : une liste
 * append-only en `jsonb`, jamais une table séparée — chaque entrée porte déjà
 * sa provenance complète (qui a saisi, quand, le niveau de confidentialité,
 * l'autorisation, le périmètre, la confiance), donc aucune jointure n'est
 * nécessaire pour la lire ou la prouver. `null` = aucune information
 * capitalisée, jamais `[]` deviné pour une fiche qui n'a jamais ouvert cet
 * écran.
 */
export class ConsultantFieldReports1796409401829 implements MigrationInterface {
  name = 'ConsultantFieldReports1796409401829'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS field_reports jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS field_reports`)
  }
}
