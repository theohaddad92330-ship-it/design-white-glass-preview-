import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Cartographier la chaîne d'outillage — #2054 (lot G4).
 *
 * `esn_profiles.tooling` est un `text[]` PLAT : il dit qu'un outil existe
 * quelque part, jamais où vit quoi, ni qui s'en sert, ni ce que ça vaut. Ces 18
 * colonnes ADDITIVES portent la chaîne — onze maillons (#2054.1 à #2054.11,
 * chacun répondant « utilisé par qui », #2054.12) puis les sept attributs de la
 * source de référence (#2054.13 à #2054.18).
 *
 * Toutes NULLABLE, aucun CHECK : le questionnaire ne bloque jamais, une question
 * passée reste NULL — jamais devinée, jamais rendue « 0 ». « Nous n'avons pas
 * cet outil » est une valeur DÉCLARÉE par l'utilisateur, distincte de l'absence
 * de réponse (contrat : `toolingFamilyIsAbsent`).
 *
 * Aucune contrainte de valeur en base : le catalogue fermé vit dans
 * `ESN_ANSWER_OPTIONS` (contracts), comme pour toutes les autres réponses du
 * questionnaire — élargir une contrainte SQL avant le code n'a pas d'objet ici,
 * il n'y en a aucune sur ces colonnes de texte libre.
 *
 * `tooling` (profil progressif) n'est PAS touchée : elle garde ses lecteurs.
 */
export class OutillageCartographie1794024402918 implements MigrationInterface {
  name = 'OutillageCartographie1794024402918'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tooling_crm text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tooling_ats text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tooling_erp text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tooling_mailbox text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tooling_calendar text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tooling_drive text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tooling_spreadsheet text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tooling_enrichment text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tooling_sourcing_platform text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tooling_bi text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tooling_personal_notes text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tooling_reference text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tooling_reference_data text[] NOT NULL DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tooling_reference_freshness text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tooling_reference_confidence text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tooling_reference_export text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tooling_duplicates text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tooling_pain text;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tooling_crm;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tooling_ats;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tooling_erp;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tooling_mailbox;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tooling_calendar;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tooling_drive;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tooling_spreadsheet;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tooling_enrichment;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tooling_sourcing_platform;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tooling_bi;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tooling_personal_notes;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tooling_reference;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tooling_reference_data;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tooling_reference_freshness;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tooling_reference_confidence;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tooling_reference_export;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tooling_duplicates;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tooling_pain;
    `)
  }
}
