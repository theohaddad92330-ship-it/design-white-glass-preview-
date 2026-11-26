import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le pipeline d'ingestion d'un CV (PDF 3 §3.3).
 *
 * Deux notions manquaient, et leur absence explique le reste :
 *
 * 1. **Un statut de qualification.** Le §3.3 pose un invariant : « aucune fiche
 *    n'atteint `qualified` sans passage humain ». Sans colonne, la garde
 *    n'existe pas — une fiche créée par extraction et une fiche relue par un
 *    recruteur se ressemblaient trait pour trait, et rien ne disait laquelle
 *    on pouvait envoyer à un client.
 * 2. **Des coordonnées comparables.** La déduplication du §3.4 se fait par
 *    e-mail puis par téléphone ; ces colonnes viennent d'arriver
 *    (`TalentEngagementAndRates`), et il fallait pouvoir les chercher
 *    rapidement sans balayer tout le vivier.
 *
 * `needs_review` est le DÉFAUT pour les fiches à venir, mais les fiches
 * EXISTANTES passent en `qualified` : elles ont été saisies à la main, donc par
 * un humain, et les rétrograder ferait apparaître un vivier entier « à relire »
 * du jour au lendemain.
 */
export class TalentIntake1789567342915 implements MigrationInterface {
  public name = 'TalentIntake1789567342915'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE consultants ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'qualified'`,
    )
    await queryRunner.query(`ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_review_status_check`)
    await queryRunner.query(`
      ALTER TABLE consultants ADD CONSTRAINT consultants_review_status_check
        CHECK (review_status IN ('needs_review', 'qualified'))
    `)
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS qualified_at timestamptz`)

    // Le défaut de la COLONNE reste `qualified` (les fiches existantes ont été
    // saisies à la main). Les fiches issues d'une extraction sont écrites
    // explicitement en `needs_review` par le code — un défaut de colonne ne peut
    // pas distinguer les deux origines.
    await queryRunner.query(`UPDATE consultants SET qualified_at = created_at WHERE qualified_at IS NULL`)

    // Recherche de doublon par coordonnée, en minuscules : deux adresses qui ne
    // diffèrent que par la casse sont la même adresse, et les traiter comme
    // deux personnes est précisément le doublon qu'on cherche à éviter.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS consultants_email_lookup_idx
        ON consultants (workspace_id, lower(email)) WHERE email IS NOT NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS consultants_phone_lookup_idx
        ON consultants (workspace_id, phone) WHERE phone IS NOT NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS consultants_review_status_idx
        ON consultants (workspace_id, review_status) WHERE review_status = 'needs_review'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS consultants_review_status_idx`)
    await queryRunner.query(`DROP INDEX IF EXISTS consultants_phone_lookup_idx`)
    await queryRunner.query(`DROP INDEX IF EXISTS consultants_email_lookup_idx`)
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS qualified_at`)
    await queryRunner.query(`ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_review_status_check`)
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS review_status`)
  }
}
