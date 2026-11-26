import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `expense_report_lines` : les deux faits sans lesquels une indemnité
 * kilométrique ne se vérifie pas (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES DEUX COLONNES RENDENT POSSIBLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un plafond de repas se compare au montant : une seule donnée suffit. Une
 * indemnité kilométrique, non — elle se compare à `distance × tarif(puissance)`.
 * Sans la distance ET sans la puissance, `expense_mileage_rates` serait un
 * barème que rien ne peut appliquer : du réglage juste, saisi, testé, que
 * personne n'appelle. C'est le défaut n°1 du dépôt, et il se corrige ici, dans
 * la même vague que le barème lui-même.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX SONT NULLABLES, ET CE N'EST PAS UN RELÂCHEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Onze des douze catégories n'ont ni distance ni puissance : un repas ne
 * parcourt pas de kilomètres. `0` serait faux au sens le plus littéral — « ce
 * trajet fait zéro kilomètre » est une mesure, et une mesure fausse. `NULL` dit
 * la seule chose vraie : la question ne se pose pas ici.
 *
 * Et sur une ligne `mileage` dont le déposant n'a rempli ni l'un ni l'autre,
 * `NULL` produit exactement le bon comportement en aval : la ligne n'est
 * comparée à rien, donc elle est NON VÉRIFIÉE, et le compte des lignes non
 * évaluées la NOMME. Le barème existe, la ligne reste incomparable, et l'écran
 * le dit — plutôt que d'écrire « conforme » sur une distance qu'il ne connaît
 * pas.
 *
 * `distance_km` est un ENTIER de kilomètres : le barème est publié au kilomètre,
 * et une précision au mètre suggérerait une exactitude qu'aucun compteur de
 * bord ne donne.
 */
export class ExpenseReportLineMileage1791005000004 implements MigrationInterface {
  public name = 'ExpenseReportLineMileage1791005000004'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE expense_report_lines
        ADD COLUMN IF NOT EXISTS distance_km integer,
        ADD COLUMN IF NOT EXISTS fiscal_horsepower integer
    `)
    await queryRunner.query(`
      ALTER TABLE expense_report_lines
        ADD CONSTRAINT expense_report_lines_distance_km_check
        CHECK (distance_km IS NULL OR distance_km > 0)
    `)
    await queryRunner.query(`
      ALTER TABLE expense_report_lines
        ADD CONSTRAINT expense_report_lines_fiscal_horsepower_check
        CHECK (fiscal_horsepower IS NULL OR (fiscal_horsepower > 0 AND fiscal_horsepower <= 50))
    `)
    await queryRunner.query(`
      COMMENT ON COLUMN expense_report_lines.distance_km IS
        'Kilometres parcourus, sur une ligne mileage uniquement. NULL = la question ne se pose pas (onze categories sur douze) ou la distance n''a pas ete saisie : dans les deux cas la ligne n''est comparee a rien et reste NON VERIFIEE. Jamais 0, qui serait une mesure fausse.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE expense_report_lines DROP CONSTRAINT IF EXISTS expense_report_lines_distance_km_check`,
    )
    await queryRunner.query(
      `ALTER TABLE expense_report_lines DROP CONSTRAINT IF EXISTS expense_report_lines_fiscal_horsepower_check`,
    )
    // Les colonnes restent : on archive, on ne supprime pas — des lignes
    // kilométriques déjà saisies perdraient leur distance.
  }
}
