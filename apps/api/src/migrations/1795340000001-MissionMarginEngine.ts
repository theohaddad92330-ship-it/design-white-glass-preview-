import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2420 — LE MOTEUR DE MARGE DE MISSION (LAU-FINAL-134, 17/09/2026).
 *
 * Cinq colonnes sur `mission_commercial_terms`, la table réservée à
 * `finance:read` — un coût se protège là où les autres coûts vivent déjà.
 *
 *  · `cost_source` — freelance / salarié / partenaire / forfait. NULLABLE, sans
 *    défaut : les lignes existantes n'ont RIEN déclaré, et leur donner une
 *    source serait deviner. `null` = le noyau historique s'applique, inchangé ;
 *  · `currency` — la devise du TJM et du contrat (ISO 4217). NULLABLE : les
 *    lignes historiques sont en euros, et c'est le MOTEUR qui le nomme comme
 *    une hypothèse, pas la base qui l'affirme ;
 *  · `cost_currency` — la devise du coût quand elle diffère. Deux devises
 *    différentes ne se soustraient pas : aucun taux de change n'est inventé ;
 *  · `cost_breakdown` — la décomposition par source (`missionCostBreakdownSchema`,
 *    `@bellum/contracts`). `jsonb` et non quinze colonnes : c'est UN objet,
 *    saisi d'UN formulaire, validé par UN schéma `.strict()` à l'écriture. La
 *    base garde ce qu'elle peut garder — que c'est un objet ;
 *  · `cost_recorded_rate_cents` — le TJM en vigueur quand le coût a été saisi,
 *    posé par le serveur. C'est lui qui fait l'alerte « tarif changé ». NULL
 *    sur les lignes existantes : on ne sait pas sur quel TJM leur coût a été
 *    pensé, et l'alerte ne se déclenche donc pas sur elles — un silence, pas
 *    un faux signal.
 *
 * GA-11 / GA-12 : les contraintes partent AVANT le code qui écrit ces valeurs
 * (`StaffingService.upsertTerms`), et `MISSION_COST_SOURCES` est couverte.
 */
export class MissionMarginEngine1795340000001 implements MigrationInterface {
  public name = 'MissionMarginEngine1795340000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms
        ADD COLUMN IF NOT EXISTS cost_source text,
        ADD COLUMN IF NOT EXISTS currency text,
        ADD COLUMN IF NOT EXISTS cost_currency text,
        ADD COLUMN IF NOT EXISTS cost_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS cost_recorded_rate_cents bigint
    `)
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms
        DROP CONSTRAINT IF EXISTS chk_mission_commercial_terms_cost_source
    `)
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms
        ADD CONSTRAINT chk_mission_commercial_terms_cost_source
          CHECK (cost_source IS NULL OR cost_source IN ('freelance', 'employee', 'partner', 'fixed_price'))
    `)
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms
        DROP CONSTRAINT IF EXISTS chk_mission_commercial_terms_currency
    `)
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms
        ADD CONSTRAINT chk_mission_commercial_terms_currency
          CHECK ((currency IS NULL OR currency ~ '^[A-Z]{3}$') AND (cost_currency IS NULL OR cost_currency ~ '^[A-Z]{3}$'))
    `)
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms
        DROP CONSTRAINT IF EXISTS chk_mission_commercial_terms_cost_breakdown
    `)
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms
        ADD CONSTRAINT chk_mission_commercial_terms_cost_breakdown
          CHECK (jsonb_typeof(cost_breakdown) = 'object')
    `)
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms
        DROP CONSTRAINT IF EXISTS chk_mission_commercial_terms_cost_recorded_rate
    `)
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms
        ADD CONSTRAINT chk_mission_commercial_terms_cost_recorded_rate
          CHECK (cost_recorded_rate_cents IS NULL OR cost_recorded_rate_cents >= 0)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of ['cost_recorded_rate', 'cost_breakdown', 'currency', 'cost_source']) {
      await queryRunner.query(
        `ALTER TABLE mission_commercial_terms DROP CONSTRAINT IF EXISTS chk_mission_commercial_terms_${name}`,
      )
    }
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms
        DROP COLUMN IF EXISTS cost_recorded_rate_cents,
        DROP COLUMN IF EXISTS cost_breakdown,
        DROP COLUMN IF EXISTS cost_currency,
        DROP COLUMN IF EXISTS currency,
        DROP COLUMN IF EXISTS cost_source
    `)
  }
}
