import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les langues parlées et les habilitations — sur le talent ET sur le besoin.
 *
 * Deux des treize axes de correspondance (langue, contraintes client) et deux des
 * onze motifs d'exclusion (`language_mismatch`, `clearance_missing`) reposaient
 * sur des données qui n'existaient nulle part. Un axe déclaré et jamais calculé
 * est un mensonge d'interface : le score affiche « /12 » et n'en pèse que dix.
 *
 * Les colonnes sont ADDITIVES et vides par défaut. Un espace qui ne renseigne
 * rien voit l'axe rester « non évaluable », donc hors du dénominateur — jamais
 * un zéro, qui se lirait « ce profil ne parle aucune langue ».
 */
export class TalentLanguagesAndClearances1789601472836 implements MigrationInterface {
  public name = 'TalentLanguagesAndClearances1789601472836'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultants
        ADD COLUMN IF NOT EXISTS languages jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS clearances text[] NOT NULL DEFAULT '{}'
    `)
    await queryRunner.query(`
      ALTER TABLE project_needs
        ADD COLUMN IF NOT EXISTS languages jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS clearances text[] NOT NULL DEFAULT '{}'
    `)
    // Quand la disponibilité a été revalidée pour la dernière fois : au-delà de
    // 60 jours, le score poussable applique sa pénalité (§3.3). Sans cette date,
    // la pénalité ne pourrait jamais se déclencher — et une disponibilité
    // annoncée au printemps continuerait de valoir en septembre.
    await queryRunner.query(`
      ALTER TABLE consultants
        ADD COLUMN IF NOT EXISTS availability_checked_at timestamptz
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultants
        DROP COLUMN IF EXISTS languages,
        DROP COLUMN IF EXISTS clearances,
        DROP COLUMN IF EXISTS availability_checked_at
    `)
    await queryRunner.query(`
      ALTER TABLE project_needs
        DROP COLUMN IF EXISTS languages,
        DROP COLUMN IF EXISTS clearances
    `)
  }
}
