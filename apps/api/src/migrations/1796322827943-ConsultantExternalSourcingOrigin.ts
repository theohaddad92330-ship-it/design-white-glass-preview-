import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2818 — l'origine du sourcing EXTERNE d'une fiche du vivier.
 *
 * GA-11/GA-12 : la colonne précède le code qui l'écrit
 * (`ExternalSourcingService.importCandidate`). NULLABLE, sans défaut : une
 * fiche entrée par tout autre chemin (saisie manuelle, dépôt de CV direct,
 * import CSV/ATS avant ce chantier) n'en gagne pas une inventée (GA-18/GA-19)
 * — `null` reste l'état ordinaire de la quasi-totalité du vivier.
 */
export class ConsultantExternalSourcingOrigin1796322827943 implements MigrationInterface {
  public name = 'ConsultantExternalSourcingOrigin1796322827943'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS external_sourcing_origin jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS external_sourcing_origin`)
  }
}
