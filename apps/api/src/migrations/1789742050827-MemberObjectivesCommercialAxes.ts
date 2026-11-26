import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les sept objectifs commerciaux — QUATRE axes de plus sur `member_objectives`
 * (#2114.16 à .22, lot FA, décision de Louis du 18/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * La recette écran du 18/09 en production : aucun objectif n'existe nulle
 * part — ni `/dashboard`, ni `/pilotage`, ni les réglages. `member_objectives`
 * (migration `1788230462911`) porte déjà TROIS axes avec un réalisé calculé sur
 * des données réelles (rendez-vous, comptes, chiffre d'affaires), mais réservés
 * au cockpit manager (`/team`). Les sept objectifs nommés du lot FA sont :
 * rendez-vous (déjà là), besoins, démarrages, chiffre d'affaires (déjà là),
 * marge, comptes (déjà là), consultants en mission. Quatre colonnes manquent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ADDITIVE, RIEN NE SE RESSERRE (GA-11/GA-12)
 * ─────────────────────────────────────────────────────────────────────────────
 * Quatre colonnes NULLABLES de plus, `IF NOT EXISTS` : aucune ligne existante
 * ne change de forme, aucun lecteur antérieur à ce lot ne voit de différence.
 * `NULL` = axe non déclaré (jamais un objectif de 0 fabriqué), exactement le
 * même contrat que les trois colonnes déjà là.
 *
 * `target_margin_percent` reprend la contrainte de `finance_margin_targets`
 * (`> 0 AND <= 100`, migration `1790982000001`) pour la même raison : un
 * objectif de marge à 0 % n'est pas un objectif, c'est un défaut de saisie —
 * et l'interdire en base garantit qu'aucun calcul d'atteinte ne divise par
 * zéro. Nullable : ne pas se fixer d'objectif de marge reste un état valide.
 */
export class MemberObjectivesCommercialAxes1789742050827 implements MigrationInterface {
  public name = 'MemberObjectivesCommercialAxes1789742050827'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE member_objectives
        ADD COLUMN IF NOT EXISTS target_qualified_needs integer,
        ADD COLUMN IF NOT EXISTS target_placements integer,
        ADD COLUMN IF NOT EXISTS target_margin_percent numeric(5,2),
        ADD COLUMN IF NOT EXISTS target_consultants_on_mission integer
    `)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'member_objectives_margin_percent_check'
        ) THEN
          ALTER TABLE member_objectives
            ADD CONSTRAINT member_objectives_margin_percent_check
            CHECK (target_margin_percent IS NULL OR (target_margin_percent > 0 AND target_margin_percent <= 100));
        END IF;
      END $$;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE member_objectives
        DROP CONSTRAINT IF EXISTS member_objectives_margin_percent_check,
        DROP COLUMN IF EXISTS target_qualified_needs,
        DROP COLUMN IF EXISTS target_placements,
        DROP COLUMN IF EXISTS target_margin_percent,
        DROP COLUMN IF EXISTS target_consultants_on_mission
    `)
  }
}
