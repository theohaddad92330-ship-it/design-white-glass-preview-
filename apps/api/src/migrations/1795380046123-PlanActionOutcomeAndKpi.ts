import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2123.46 — le RÉSULTAT ATTENDU et l'INDICATEUR d'une action deviennent des
 * colonnes de `action_plan_items`.
 *
 * Quatre écrivains du plan (la veille, la fiche contact, le panneau besoin,
 * l'ajout en masse de contacts) écrivaient encore dans
 * `raw_analysis.user_plan_actions`, un objet JSON qui portait `expected_outcome`
 * et `kpi` à côté du libellé. Les basculer vers la ligne canonique sans ces
 * deux colonnes aurait perdu en silence ce que la carte du plan affichait —
 * même défaut, même réponse que `1794100592374-PlanActionOwnerName`.
 *
 * En AJOUT SEULEMENT, nullables et sans défaut : aucune ligne existante ne
 * change de sens, `NULL` veut dire « rien de saisi », ce qui n'est pas une
 * chaîne vide. Posée AVANT le code qui les écrit (GA-11 / GA-12). L'ancien
 * champ JSON n'est ni migré ni effacé : il reste LU comme historique — on
 * archive, on ne supprime pas.
 */
export class PlanActionOutcomeAndKpi1795380046123 implements MigrationInterface {
  public name = 'PlanActionOutcomeAndKpi1795380046123'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS expected_outcome text`)
    await queryRunner.query(`ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS kpi text`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
