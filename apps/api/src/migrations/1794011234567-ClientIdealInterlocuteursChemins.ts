import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Client idéal, interlocuteurs, chemins d'accès — lot L17 (#2042, #2043,
 * #2044). Dix-neuf colonnes ADDITIVES, toutes NULLABLE (les arrays par défaut
 * `'{}'`, comme le reste du Temps 1) : le questionnaire ne bloque jamais, une
 * question passée reste vide, jamais devinée.
 *
 * Les quatre `entry_channels_*` sans commentaire spécifique portent le bloc
 * `CANAUX_ANSWER_FIELDS` de l'issue #2048 (lot L19, `answers-canaux.ts`),
 * apporté ici en dépendance pour que #2044 puisse pointer sur le même
 * catalogue de canaux plutôt que d'en recréer un second (GA-26) — voir le
 * rapport du lot pour le détail de cette dépendance.
 *
 * ⚠️ L'HORODATAGE n'est pas un nombre rond (garde `src/database/migrations.spec.ts`,
 * qui rejette tout horodatage divisible par 100 000 000 à partir de
 * `1786600000001`) et suit le dernier migré (`1794010000000`,
 * `MaturiteEffectifReel`).
 */
export class ClientIdealInterlocuteursChemins1794011234567 implements MigrationInterface {
  name = 'ClientIdealInterlocuteursChemins1794011234567'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS ideal_client_size text[] DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS ideal_client_structure text[] DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS ideal_client_maturity text[] DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS ideal_client_territory text[] DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS ideal_client_accessibility text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS ideal_client_max_sales_cycle text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS ideal_client_min_deal_size text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS ideal_client_referencement_constraints text[] DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS ideal_client_current_state text[] DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS real_response_level text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS budget_validator text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS access_orienteur text;
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS entry_channels_used text[] DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS entry_channels_measured text[] DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS entry_channels_last_starts text[] DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS entry_channels_time_split text[] DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS entry_channels_dependency text[] DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS entry_channels_prerequisites text[] DEFAULT '{}';
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS entry_channels_saturation text[] DEFAULT '{}';
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS ideal_client_size;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS ideal_client_structure;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS ideal_client_maturity;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS ideal_client_territory;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS ideal_client_accessibility;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS ideal_client_max_sales_cycle;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS ideal_client_min_deal_size;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS ideal_client_referencement_constraints;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS ideal_client_current_state;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS real_response_level;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS budget_validator;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS access_orienteur;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS entry_channels_used;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS entry_channels_measured;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS entry_channels_last_starts;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS entry_channels_time_split;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS entry_channels_dependency;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS entry_channels_prerequisites;
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS entry_channels_saturation;
    `)
  }
}
